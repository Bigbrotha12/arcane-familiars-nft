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
  applyFamiliarXp,
  battleXp,
  getFamiliar,
  scaleEnemy,
  type BattleFamiliar,
  type BattleRewards,
  type BattleState,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * Combat-rules wiring at the HTTP layer:
 * - bosses spawn scaled to the top of the area level band
 * - normal enemies keep the encounter's rolled level
 * - XP is derived from the enemy level (boss multiplier included)
 * - the bench party member receives a reduced XP share
 */

function makeEnv(environment = 'development'): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request, environment = 'development'): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(environment), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body: Record<string, unknown>, ip = '10.1.0.1'): Request {
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

function makeState(
  anonId: string,
  opts: {
    activeParty?: string[];
    partyHp?: Record<string, number>;
    partyMp?: Record<string, number>;
    enemyId?: string;
    enemyLevel?: number;
    withDungeon?: boolean;
  } = {}
): GameState {
  const activeParty = opts.activeParty ?? ['whiteDog', 'yellowFighter'];
  const partyHp = opts.partyHp ?? { whiteDog: 120, yellowFighter: 140 };
  const partyMp = opts.partyMp ?? { whiteDog: 80, yellowFighter: 60 };

  const state: GameState = {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: [...activeParty],
    activeParty: [...activeParty],
    inventory: { currency: 100, items: [] },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };

  if (opts.withDungeon ?? true) {
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
          pendingEncounter: {
            enemyId: opts.enemyId ?? 'tideTurtle',
            resolved: false,
            ...(opts.enemyLevel !== undefined ? { level: opts.enemyLevel } : {}),
          },
        },
      },
      seed: 1,
    };
  }

  return state;
}

async function seed(anonId: string, state: GameState, battle?: BattleState): Promise<void> {
  const db = (env as unknown as Bindings).DB;
  await db
    .prepare(
      `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), 1)`
    )
    .bind(anonId, JSON.stringify(state))
    .run();
  if (battle) {
    await db
      .prepare(
        `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`
      )
      .bind(battle.id, anonId, JSON.stringify(battle))
      .run();
  }
}

async function readState(anonId: string): Promise<GameState> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string }>();
  if (!row) throw new Error(`No game_states row for ${anonId}`);
  return JSON.parse(row.state_json) as GameState;
}

function winBattle(anonId: string, battleId: string): Request {
  return post('/api/game/battle/action', {
    anonymousId: anonId,
    battleId,
    action: { type: ActionType.Attack },
    expectedTurnCount: 0,
  });
}

function makeBattle(
  battleId: string,
  opts: {
    playerId?: string;
    playerHp?: number;
    playerMp?: number;
    enemyId: string;
    isBoss?: boolean;
    enemyLevel?: number;
  }
): BattleState {
  return {
    id: battleId,
    playerFamiliar: makeCombatant(opts.playerId ?? 'whiteDog', opts.playerHp ?? 120, opts.playerMp ?? 80, true),
    // 1 HP guarantees the player's opening attack wins regardless of speed.
    enemyFamiliar: makeCombatant(opts.enemyId, 1, 70, false),
    isBoss: opts.isBoss ?? false,
    ...(opts.enemyLevel !== undefined ? { enemyLevel: opts.enemyLevel } : {}),
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
  };
}

async function actAndReadRewards(
  anonId: string,
  battle: BattleState
): Promise<{ rewards?: BattleRewards; state: GameState }> {
  const res = await fetchApp(winBattle(anonId, battle.id));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { turnResult: { battleOutcome: Outcome; rewards?: BattleRewards } };
  expect(body.turnResult.battleOutcome).toBe(Outcome.Win);
  return { rewards: body.turnResult.rewards, state: await readState(anonId) };
}

describe('battle start scaling', () => {
  it('spawns a non-boss enemy at the level fixed when the encounter was rolled', async () => {
    const anonId = '1c1c6f60-6a0d-4f0b-9d3a-1f1b2c3d4e5f';
    await seed(anonId, makeState(anonId, { enemyId: 'tideTurtle', enemyLevel: 2 }));

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const { battle } = (await res.json()) as { battle: BattleState };

    expect(battle.enemyLevel).toBe(2);
    expect(battle.isBoss).toBe(false);
    const expected = scaleEnemy(getFamiliar('tideTurtle')!, 2);
    expect(battle.enemyFamiliar.familiarData.stats).toEqual(expected.stats);
  });

  it('spawns bosses scaled to the top of the area level band', async () => {
    const anonId = '2d2d7a70-7b1e-4a1c-ae4b-2f2c3d4e5f60';
    await seed(anonId, makeState(anonId, { enemyId: 'meadowGuardian' }));

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const { battle } = (await res.json()) as { battle: BattleState };

    // verdantMeadow levelRange is [1, 3].
    expect(battle.enemyLevel).toBe(3);
    expect(battle.isBoss).toBe(true);
    const base = getFamiliar('meadowGuardian')!;
    expect(battle.enemyFamiliar.familiarData.stats).toEqual(scaleEnemy(base, 3).stats);
    // Sanity: a boss must spawn stronger than its base level-1 kit.
    expect(battle.enemyFamiliar.currentHp).toBeGreaterThan(base.stats.hp);
  });

  it('falls back to the area minimum when the encounter has no level', async () => {
    const anonId = '3e3e8b80-8c2f-4b2d-bf5c-3a3d4e5f6071';
    await seed(anonId, makeState(anonId, { enemyId: 'tideTurtle' }));

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const { battle } = (await res.json()) as { battle: BattleState };
    expect(battle.enemyLevel).toBe(1);
  });
});

describe('battle rewards XP', () => {
  it('awards XP from the enemy level to the active familiar and a share to the bench', async () => {
    const anonId = '4f4f9c90-9d3a-4c3e-c06d-4b4e5f607182';
    const battle = makeBattle('battle-xp-bench', { enemyId: 'tideTurtle', enemyLevel: 4 });
    await seed(anonId, makeState(anonId), battle);

    const { rewards, state } = await actAndReadRewards(anonId, battle);

    const xp = battleXp(4, false);
    expect(rewards?.xp).toBe(xp);
    expect(rewards?.benchXp).toBe(Math.round(xp * 0.5));
    expect(rewards?.benchFamiliarId).toBe('yellowFighter');
    expect(rewards?.benchLevelUp).toBe(0);

    expect(state.familiarLevels?.whiteDog).toBe(1);
    expect(state.familiarXp?.whiteDog).toBe(xp);
    expect(state.familiarLevels?.yellowFighter).toBe(1);
    expect(state.familiarXp?.yellowFighter).toBe(Math.round(xp * 0.5));
  });

  it('applies the boss XP multiplier', async () => {
    const anonId = '5a5a0d10-0e4b-4d4f-d17e-5c5f60718293';
    // High player HP: shadowLord can crit hard on the opening turn.
    const battle = makeBattle('battle-xp-boss', {
      enemyId: 'shadowLord',
      playerHp: 9999,
      isBoss: true,
      enemyLevel: 5,
    });
    await seed(anonId, makeState(anonId, { withDungeon: false }), battle);

    const { rewards, state } = await actAndReadRewards(anonId, battle);

    const xp = battleXp(5, true);
    expect(rewards?.xp).toBe(xp);
    expect(rewards?.xp).toBeGreaterThan(battleXp(5, false));
    expect(rewards?.benchXp).toBe(Math.round(xp * 0.5));

    const activeProgress = applyFamiliarXp(1, 0, xp);
    const benchProgress = applyFamiliarXp(1, 0, Math.round(xp * 0.5));
    expect(state.familiarLevels?.whiteDog).toBe(activeProgress.level);
    expect(state.familiarXp?.whiteDog).toBe(activeProgress.xp);
    expect(state.familiarLevels?.yellowFighter).toBe(benchProgress.level);
    expect(state.familiarXp?.yellowFighter).toBe(benchProgress.xp);
  });

  it("joins a boss's gift familiar just below the area's top level, not at level 1", async () => {
    const anonId = '8d8d3a40-317e-4a72-a4ab-8f8293a4b5c6';
    const battle = makeBattle('battle-boss-gift', {
      enemyId: 'meadowGuardian',
      playerHp: 9999,
      isBoss: true,
      enemyLevel: 3,
    });
    await seed(anonId, makeState(anonId), battle);

    const { state } = await actAndReadRewards(anonId, battle);

    // Verdant Meadow's boss gifts honeyBear; the area tops out at level 3.
    expect(state.playerFamiliars).toContain('honeyBear');
    expect(state.familiarLevels?.honeyBear).toBe(2);
  });

  it('falls back to enemy level 1 for battles persisted before enemyLevel existed', async () => {
    const anonId = '6b6b1e20-1f5c-4e50-e28f-6d60718293a4';
    const battle = makeBattle('battle-xp-legacy', { enemyId: 'tideTurtle' });
    await seed(anonId, makeState(anonId), battle);

    const { rewards } = await actAndReadRewards(anonId, battle);
    expect(rewards?.xp).toBe(battleXp(1, false));
  });

  it('omits bench fields when the party has a single member', async () => {
    const anonId = '7c7c2f30-206d-4f61-f39a-7e718293a4b5';
    const battle = makeBattle('battle-xp-solo', { enemyId: 'tideTurtle', enemyLevel: 2 });
    await seed(
      anonId,
      makeState(anonId, { activeParty: ['whiteDog'], partyHp: { whiteDog: 120 }, partyMp: { whiteDog: 80 } }),
      battle
    );

    const { rewards } = await actAndReadRewards(anonId, battle);
    expect(rewards?.benchXp).toBeUndefined();
    expect(rewards?.benchFamiliarId).toBeUndefined();
  });
});
