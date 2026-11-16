import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  BattleResult,
  CURIOS,
  Directions,
  RoomType,
  buildRunSummary,
  getFamiliar,
  resolveCurioOption,
  roomRollSeed,
  seededRandom,
  type BattleFamiliar,
  type BattleState,
  type CurioOutcome,
  type DungeonState,
  type GameState,
  type Room,
} from '@arcane-familiars/game-logic';

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: 'development' };
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

let ipSuffix = 0;
function post(path: string, body: Record<string, unknown>): Request {
  ipSuffix += 1;
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'CF-Connecting-IP': `10.88.${Math.floor(ipSuffix / 200)}.${ipSuffix % 200}`,
    },
    body: JSON.stringify(body),
  });
}

function room(overrides: Partial<Room> & Pick<Room, 'id'>): Room {
  return {
    name: overrides.id,
    description: '',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: true,
    ...overrides,
  };
}

function makeDungeon(overrides: Partial<DungeonState> = {}): DungeonState {
  return {
    areaId: 'verdantMeadow',
    currentRoomId: 'room_0',
    party: ['whiteDog'],
    partyHp: { whiteDog: 100 },
    partyMp: { whiteDog: 60 },
    rooms: {
      room_0: room({ id: 'room_0', cleared: true }),
      room_1: room({ id: 'room_1', cleared: true }),
    },
    seed: 1,
    runLoot: { currency: 50, items: [{ itemId: 'potion_small', quantity: 2 }] },
    ...overrides,
  };
}

function makeState(anonId: string, dungeon: DungeonState, overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog'],
    activeParty: ['whiteDog'],
    familiarLevels: { whiteDog: 1 },
    familiarXp: {},
    inventory: { currency: 100, items: [] },
    dungeon,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
    ...overrides,
  };
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

function combatant(
  familiarId: string,
  hp: number,
  mp: number,
  overrides: Partial<BattleFamiliar> = {}
): BattleFamiliar {
  return {
    uid: `u-${familiarId}`,
    familiarData: getFamiliar(familiarId)!,
    currentHp: hp,
    currentMp: mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: familiarId === 'whiteDog',
    ...overrides,
  };
}

function makeBattle(anonId: string, overrides: Partial<BattleState> = {}): BattleState {
  return {
    id: `battle-${anonId}`,
    roomId: 'room_1',
    playerFamiliar: combatant('whiteDog', 9999, 60),
    enemyFamiliar: combatant('sparkMouse', 1, 60),
    isBoss: false,
    enemyLevel: 2,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
    ...overrides,
  };
}

function findSeed(curioId: string, optionId: string, predicate: (o: CurioOutcome) => boolean): number {
  const curio = CURIOS[curioId];
  for (let seed = 1; seed <= 5000; seed++) {
    const resolution = resolveCurioOption(curio, optionId, seededRandom(roomRollSeed(seed, 'room_1:curio')));
    if (resolution && predicate(resolution.outcome)) return seed;
  }
  throw new Error(`No seed found for ${curioId}/${optionId}`);
}

describe('run stats and summaries', () => {
  it('counts the first visit to a room and not re-entries', async () => {
    const anonId = '11111111-1111-4111-8111-111111111111';
    const dungeon = makeDungeon({
      rooms: {
        room_0: room({
          id: 'room_0',
          cleared: true,
          exits: [{ direction: Directions.North, roomId: 'room_1', label: 'Next' }],
        }),
        room_1: room({
          id: 'room_1',
          cleared: false,
          exits: [{ direction: Directions.South, roomId: 'room_0', label: 'Back' }],
        }),
      },
    });
    await seed(anonId, makeState(anonId, dungeon));

    const res = await fetchApp(post('/api/game/dungeon/explore', { anonymousId: anonId, roomId: 'room_1' }));
    expect(res.status).toBe(200);

    const state = await readState(anonId);
    expect(state.dungeon!.runStats?.roomsExplored).toBe(1);

    // Re-entering an already-explored room does not count again.
    const again = await fetchApp(post('/api/game/dungeon/explore', { anonymousId: anonId, roomId: 'room_0' }));
    expect(again.status).toBe(200);
    const after = await readState(anonId);
    expect(after.dungeon!.runStats?.roomsExplored).toBe(1);
  });

  it('counts a collected treasure chest', async () => {
    const anonId = '22222222-2222-4222-8222-222222222222';
    const dungeon = makeDungeon({
      currentRoomId: 'room_1',
      rooms: {
        room_1: room({
          id: 'room_1',
          pendingEncounter: { enemyId: 'sparkMouse', resolved: true },
          pendingTreasure: { itemId: 'fire_bomb', looted: false, items: ['fire_bomb'], currency: 10 },
        }),
      },
    });
    await seed(anonId, makeState(anonId, dungeon));

    const res = await fetchApp(
      post('/api/game/dungeon/collect-treasure', { anonymousId: anonId, roomId: 'room_1', itemId: 'fire_bomb' })
    );
    expect(res.status).toBe(200);

    const state = await readState(anonId);
    expect(state.dungeon!.runStats?.chestsOpened).toBe(1);
  });

  it('counts a curio use and a chest curio outcome', async () => {
    const anonId = '33333333-3333-4333-8333-333333333333';
    const seedValue = findSeed('abandonedPack', 'search', (outcome) => outcome.kind === 'chest');
    const dungeon = makeDungeon({
      currentRoomId: 'room_1',
      seed: seedValue,
      rooms: {
        room_1: room({ id: 'room_1', curio: { id: 'abandonedPack', used: false } }),
      },
    });
    await seed(anonId, makeState(anonId, dungeon));

    const res = await fetchApp(
      post('/api/game/dungeon/curio', { anonymousId: anonId, roomId: 'room_1', optionId: 'search' })
    );
    expect(res.status).toBe(200);

    const state = await readState(anonId);
    expect(state.dungeon!.runStats?.curiosUsed).toBe(1);
    expect(state.dungeon!.runStats?.chestsOpened).toBe(1);
  });

  it('increments battle, elite, XP and best-hit stats on a win', async () => {
    const anonId = '44444444-4444-4444-8444-444444444444';
    const dungeon = makeDungeon({
      currentRoomId: 'room_1',
      rooms: {
        room_1: room({ id: 'room_1', pendingEncounter: { enemyId: 'sparkMouse', resolved: false, level: 2 } }),
      },
    });
    const battle = makeBattle(anonId, {
      enemyFamiliar: combatant('sparkMouse', 1, 60, { elite: 'armored' }),
    });
    await seed(anonId, makeState(anonId, dungeon), battle);

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId: battle.id,
        action: { type: ActionType.Attack },
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(200);

    const state = await readState(anonId);
    const stats = state.dungeon!.runStats!;
    expect(stats.battlesWon).toBe(1);
    expect(stats.elitesWon).toBe(1);
    expect(stats.xpByFamiliar.whiteDog).toBeGreaterThan(0);
    expect(stats.bestHit?.damage).toBeGreaterThan(0);
    expect(stats.bestHit?.familiarId).toBe('whiteDog');
  });

  it('returns and stores a retreated summary on exit', async () => {
    const anonId = '55555555-5555-4555-8555-555555555555';
    await seed(anonId, makeState(anonId, makeDungeon()));

    const res = await fetchApp(post('/api/game/dungeon/exit', { anonymousId: anonId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runSummary: { outcome: string; loot: { currency: number } } };
    expect(body.runSummary.outcome).toBe('retreated');
    expect(body.runSummary.loot.currency).toBe(50);

    const state = await readState(anonId);
    expect(state.dungeon).toBeNull();
    expect(state.lastRunSummary).toEqual(body.runSummary);
  });

  it('returns and stores a cleared summary on a boss win', async () => {
    const anonId = '66666666-6666-4666-8666-666666666666';
    const dungeon = makeDungeon({
      currentRoomId: 'room_1',
      rooms: {
        room_1: room({ id: 'room_1', pendingEncounter: { enemyId: 'meadowGuardian', resolved: false } }),
      },
    });
    const battle = makeBattle(anonId, {
      playerFamiliar: combatant('whiteDog', 9999, 60),
      enemyFamiliar: combatant('meadowGuardian', 1, 60),
      isBoss: true,
    });
    await seed(anonId, makeState(anonId, dungeon, { defeatedBosses: ['meadowGuardian'] }), battle);

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId: battle.id,
        action: { type: ActionType.Attack },
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runSummary: { outcome: string; areaName: string } };
    expect(body.runSummary.outcome).toBe('cleared');
    expect(body.runSummary.areaName).toBe('Verdant Meadow');

    const state = await readState(anonId);
    expect(state.dungeon).toBeNull();
    expect(state.lastRunSummary?.outcome).toBe('cleared');
  });

  it('returns and stores a defeated summary with the lost loot', async () => {
    const anonId = '77777777-7777-4777-8777-777777777777';
    const dungeon = makeDungeon({
      currentRoomId: 'room_1',
      rooms: {
        room_1: room({ id: 'room_1', pendingEncounter: { enemyId: 'sparkMouse', resolved: false } }),
      },
    });
    const battle = makeBattle(anonId, {
      playerFamiliar: combatant('whiteDog', 1, 60),
      enemyFamiliar: combatant('sparkMouse', 9999, 60),
    });
    await seed(anonId, makeState(anonId, dungeon), battle);

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId: battle.id,
        action: { type: ActionType.Attack },
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runSummary: { outcome: string; loot: { currency: number }; lost?: { currency: number } };
    };
    expect(body.runSummary.outcome).toBe('defeated');
    expect(body.runSummary.loot.currency).toBe(0);
    expect(body.runSummary.lost?.currency).toBe(50);

    const state = await readState(anonId);
    expect(state.dungeon).toBeNull();
    expect(state.lastRunSummary?.outcome).toBe('defeated');
  });

  it('clears the last summary when the client acknowledges it', async () => {
    const anonId = '88888888-8888-4888-8888-888888888888';
    const summary = buildRunSummary({
      outcome: 'retreated',
      areaId: 'verdantMeadow',
      stats: {
        battlesWon: 0,
        elitesWon: 0,
        roomsExplored: 0,
        chestsOpened: 0,
        curiosUsed: 0,
        xpByFamiliar: {},
        levelsByFamiliar: {},
        recruits: [],
        bondGains: {},
        learned: [],
        passiveUnlocks: [],
      },
      loot: { currency: 0, items: [] },
    });
    await seed(anonId, makeState(anonId, makeDungeon(), { lastRunSummary: summary }));

    const res = await fetchApp(post('/api/game/run-summary/ack', { anonymousId: anonId }));
    expect(res.status).toBe(200);

    const state = await readState(anonId);
    expect(state.lastRunSummary).toBeUndefined();
  });
});
