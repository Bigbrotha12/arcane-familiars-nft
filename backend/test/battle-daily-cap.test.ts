import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  BattleResult,
  Outcome,
  RoomType,
  getFamiliar,
  type BattleFamiliar,
  type BattleState,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * Coverage for the daily battle cap (WS4 step 18):
 * - POST /api/game/battle/start returns 403 + Retry-After when the account has
 *   already completed MAX_BATTLES_PER_DAY (20) battles on today's UTC day, and
 *   that check fires before any dungeon/party/encounter validation.
 * - POST /api/game/battle/action counts a completed battle (Win OR Loss) via
 *   countCompletedBattle, rolling the UTC day (stale battlesDayUtc resets the
 *   counter to 0 before the increment). Flee does NOT count.
 * - The counters live in state_json (battlesToday / battlesDayUtc).
 *
 * Determinism:
 * - Force a Win: enemy currentHp forced to 1 (player always deals >= 1 damage,
 *   so the enemy dies on turn 1 regardless of speed order / enemy action).
 * - Force a Loss: player currentHp 1 against an enemy whose every possible
 *   action deals damage. tideTurtle has the `sturdy` buff (50% RNG branch),
 *   which would leave the player alive; yellowFighter's only ability is the
 *   damage move `brave`, so its buff/ability branches never fire — its action
 *   is guaranteed damage -> guaranteed KO -> Loss. Party is a single familiar
 *   so the involuntary KO relay cannot turn the Loss into a Continue.
 * - Boss Win: shadowLord (speed 255) always acts first; the player is given
 *   HP 9999 so even the strongest fireball crit (~641) cannot KO it before it
 *   acts, and it kills the 1 HP boss.
 */

function makeEnv(environment: string): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request, environment = 'production'): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(environment), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body: Record<string, unknown>, ip: string): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

function makeCombatant(familiarId: string, hp: number, mp: number, isAlly: boolean): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: hp,
    currentMp: mp,
    statusEffects: [],
    cooldowns: {},
    isAlly,
  };
}

async function seedState(anonId: string, state: GameState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), 1)`
  )
    .bind(anonId, JSON.stringify(state))
    .run();
}

async function seedBattle(battleId: string, anonId: string, battle: BattleState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battleId, anonId, JSON.stringify(battle))
    .run();
}

function makeState(
  anonId: string,
  opts: {
    activeParty?: string[];
    partyHp?: Record<string, number>;
    partyMp?: Record<string, number>;
    enemyId?: string;
    pendingEncounter?: { enemyId: string; resolved: boolean; level?: number } | null;
    withDungeon?: boolean;
    battlesToday?: number;
    battlesDayUtc?: string;
  } = {}
): GameState {
  const activeParty = opts.activeParty ?? ['yellowFighter', 'whiteDog'];
  const partyHp = opts.partyHp ?? { yellowFighter: 140, whiteDog: 120 };
  const partyMp = opts.partyMp ?? { yellowFighter: 60, whiteDog: 80 };
  const pending = opts.pendingEncounter ?? { enemyId: opts.enemyId ?? 'tideTurtle', resolved: false };

  const state: GameState = {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: [...activeParty],
    activeParty: [...activeParty],
    inventory: { currency: 100, items: [{ itemId: 'potion_small', quantity: 1 }] },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };

  if ((opts.withDungeon ?? true) && pending) {
    state.dungeon = {
      areaId: 'verdantMeadow',
      currentRoomId: 'room-1',
      party: [...activeParty],
      partyHp: { ...partyHp },
      partyMp: { ...partyMp },
      rooms: {
        'room-1': {
          id: 'room-1',
          name: 'Room 1',
          description: 'Test room',
          type: RoomType.Normal,
          exits: [],
          encounterChance: 0,
          treasureChance: 0,
          treasurePool: [],
          cleared: true,
          pendingEncounter: { ...pending },
        },
      },
      seed: 1,
    };
  }

  if (opts.battlesToday !== undefined) state.battlesToday = opts.battlesToday;
  if (opts.battlesDayUtc !== undefined) state.battlesDayUtc = opts.battlesDayUtc;

  return state;
}

async function readState(anonId: string): Promise<GameState> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string }>();
  if (!row) throw new Error(`No game_states row for ${anonId}`);
  return JSON.parse(row.state_json) as GameState;
}

async function setEnemyHp(battleId: string, hp: number): Promise<void> {
  const db = (env as unknown as Bindings).DB;
  const row = await db
    .prepare('SELECT battle_json FROM active_battles WHERE battle_id = ?')
    .bind(battleId)
    .first<{ battle_json: string }>();
  const battle = JSON.parse(row!.battle_json) as BattleState;
  battle.enemyFamiliar.currentHp = hp;
  await db
    .prepare("UPDATE active_battles SET battle_json = ?, updated_at = datetime('now') WHERE battle_id = ?")
    .bind(JSON.stringify(battle), battleId)
    .run();
}

async function resetPendingEncounter(anonId: string, enemyId: string): Promise<void> {
  const db = (env as unknown as Bindings).DB;
  const row = await db
    .prepare('SELECT state_json, version FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string; version: number }>();
  const state = JSON.parse(row!.state_json) as GameState;
  const room = state.dungeon?.rooms[state.dungeon.currentRoomId];
  if (room) room.pendingEncounter = { enemyId, resolved: false };
  await db
    .prepare(
      `UPDATE game_states SET state_json = ?, version = version + 1, updated_at = datetime('now')
     WHERE anonymous_id = ? AND version = ?`
    )
    .bind(JSON.stringify(state), anonId, row!.version)
    .run();
}

function startBody(anonId: string, playerFamiliarId = 'yellowFighter'): Record<string, unknown> {
  return { anonymousId: anonId, playerFamiliarId };
}

function actionBody(anonId: string, battleId: string): Record<string, unknown> {
  return { anonymousId: anonId, battleId, action: { type: ActionType.Attack }, expectedTurnCount: 0 };
}

function fleeBody(anonId: string, battleId: string): Record<string, unknown> {
  return { anonymousId: anonId, battleId, expectedTurnCount: 0 };
}

describe('daily battle cap', () => {
  it('rejects start with 403 + Retry-After once the cap is reached, before any validation', async () => {
    const anonId = 'anon-daily-cap-reached';
    const ip = '1.0.0.10';
    const today = new Date().toISOString().slice(0, 10);
    // Full dungeon with an unresolved encounter (would otherwise pass the start
    // guard): the cap must still short-circuit before validation.
    await seedState(anonId, makeState(anonId, { battlesToday: 20, battlesDayUtc: today }));

    const res = await fetchApp(post('/api/game/battle/start', startBody(anonId), ip));
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Daily battle limit reached');
    expect(body.error).toContain(`${today}T00:00:00Z`);

    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it('checks the cap before dungeon validation (403, not the 409 no-dungeon error)', async () => {
    const anonId = 'anon-cap-before-validation';
    const ip = '1.0.0.11';
    const today = new Date().toISOString().slice(0, 10);
    // Minimal state with NO dungeon and a full counter: the cap check runs
    // before the 'No active dungeon' guard, so this must be 403.
    await seedState(anonId, makeState(anonId, { withDungeon: false, battlesToday: 20, battlesDayUtc: today }));

    const res = await fetchApp(post('/api/game/battle/start', startBody(anonId), ip));
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Daily battle limit reached');
    expect(body.error).not.toContain('No active dungeon');
  });

  it('allows start when the counter is below the cap', async () => {
    const anonId = 'anon-under-cap';
    const ip = '1.0.0.12';
    const today = new Date().toISOString().slice(0, 10);
    await seedState(anonId, makeState(anonId, { battlesToday: 19, battlesDayUtc: today }));

    const res = await fetchApp(post('/api/game/battle/start', startBody(anonId), ip));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { battle: BattleState };
    expect(typeof body.battle.id).toBe('string');
    expect(body.battle.id.length).toBeGreaterThan(0);
  });

  it('counts a win and rolls the UTC day (stale counter resets to 0 then +1)', async () => {
    const anonId = 'anon-win-rollover';
    const ip = '1.0.0.13';
    const today = new Date().toISOString().slice(0, 10);
    // battlesDayUtc is a stale day, so the start cap check sees usedToday = 0
    // even though the raw counter is 20.
    await seedState(anonId, makeState(anonId, { battlesToday: 20, battlesDayUtc: '2020-01-01' }));

    const start = await fetchApp(post('/api/game/battle/start', startBody(anonId), ip));
    expect(start.status).toBe(200);
    const { battle } = (await start.json()) as { battle: BattleState };

    // Force a deterministic first-turn win: the start route scales the enemy
    // to full HP, so drop it to 1 HP (player always deals >= 1 damage).
    await setEnemyHp(battle.id, 1);

    const action = await fetchApp(post('/api/game/battle/action', actionBody(anonId, battle.id), ip));
    expect(action.status).toBe(200);
    const turn = (await action.json()) as { turnResult: { battleOutcome: Outcome } };
    expect(turn.turnResult.battleOutcome).toBe(Outcome.Win);

    const persisted = await readState(anonId);
    expect(persisted.battlesToday).toBe(1);
    expect(persisted.battlesDayUtc).toBe(today);

    // The win resolved the room encounter; restore it so a second start can
    // pass validation. With battlesToday = 1 the cap no longer blocks.
    await resetPendingEncounter(anonId, 'tideTurtle');
    const second = await fetchApp(post('/api/game/battle/start', startBody(anonId), ip));
    expect(second.status).toBe(200);
  });

  it('counts a loss toward the cap and then blocks further starts', async () => {
    const anonId = 'anon-loss-counts';
    const ip = '1.0.0.14';
    const today = new Date().toISOString().slice(0, 10);
    await seedState(
      anonId,
      makeState(anonId, {
        // Single-familiar party at 1 HP so the KO relay cannot turn the Loss
        // into a Continue. yellowFighter as the enemy (rather than tideTurtle,
        // whose 50% sturdy-buff branch leaves the player alive) guarantees the
        // enemy's action deals damage -> the player is KO'd this turn.
        activeParty: ['yellowFighter'],
        partyHp: { yellowFighter: 1 },
        partyMp: { yellowFighter: 60 },
        enemyId: 'yellowFighter',
        battlesToday: 19,
        battlesDayUtc: today,
      })
    );

    const start = await fetchApp(post('/api/game/battle/start', startBody(anonId, 'yellowFighter'), ip));
    expect(start.status).toBe(200);
    const { battle } = (await start.json()) as { battle: BattleState };

    const action = await fetchApp(post('/api/game/battle/action', actionBody(anonId, battle.id), ip));
    expect(action.status).toBe(200);
    const turn = (await action.json()) as { turnResult: { battleOutcome: Outcome } };
    expect(turn.turnResult.battleOutcome).toBe(Outcome.Loss);

    const persisted = await readState(anonId);
    expect(persisted.battlesToday).toBe(20);
    expect(persisted.battlesDayUtc).toBe(today);

    const blocked = await fetchApp(post('/api/game/battle/start', startBody(anonId, 'yellowFighter'), ip));
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: string }).error).toContain('Daily battle limit reached');
  });

  it('does not count a flee toward the cap', async () => {
    const anonId = 'anon-flee-not-counted';
    const ip = '1.0.0.15';
    const today = new Date().toISOString().slice(0, 10);
    await seedState(anonId, makeState(anonId, { battlesToday: 19, battlesDayUtc: today }));

    const start = await fetchApp(post('/api/game/battle/start', startBody(anonId), ip));
    expect(start.status).toBe(200);
    const { battle } = (await start.json()) as { battle: BattleState };

    const flee = await fetchApp(post('/api/game/battle/flee', fleeBody(anonId, battle.id), ip));
    expect(flee.status).toBe(200);

    const persisted = await readState(anonId);
    expect(persisted.battlesToday).toBe(19);
    expect(persisted.battlesDayUtc).toBe(today);

    // Flee leaves the room encounter pending, so a new start is allowed.
    const second = await fetchApp(post('/api/game/battle/start', startBody(anonId), ip));
    expect(second.status).toBe(200);
  });

  it('counts a boss win toward the cap', async () => {
    const anonId = 'anon-boss-win-counts';
    const ip = '1.0.0.16';
    const today = new Date().toISOString().slice(0, 10);
    // No dungeon: the boss battle is seeded directly so this isolates the boss
    // Win branch of the action route.
    await seedState(anonId, makeState(anonId, { withDungeon: false, battlesToday: 19, battlesDayUtc: today }));

    const battleId = 'battle-boss-win-counts';
    const battle: BattleState = {
      id: battleId,
      // shadowLord (speed 255) always acts first and can deal up to ~641
      // (fireball crit); 9999 HP guarantees the player survives to kill it.
      playerFamiliar: makeCombatant('yellowFighter', 9999, 60, true),
      enemyFamiliar: makeCombatant('shadowLord', 1, 270, false),
      isBoss: true,
      turnCount: 0,
      status: BattleResult.Active,
      swapsThisTurn: 0,
      seed: 7,
    };
    await seedBattle(battleId, anonId, battle);

    const action = await fetchApp(post('/api/game/battle/action', actionBody(anonId, battleId), ip));
    expect(action.status).toBe(200);
    const turn = (await action.json()) as { turnResult: { battleOutcome: Outcome } };
    expect(turn.turnResult.battleOutcome).toBe(Outcome.Win);

    const persisted = await readState(anonId);
    expect(persisted.battlesToday).toBe(20);
    expect(persisted.battlesDayUtc).toBe(today);
  });
});
