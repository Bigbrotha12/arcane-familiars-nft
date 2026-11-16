import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  RoomType,
  applyElite,
  battleXp,
  Directions,
  eliteChanceForRoom,
  eliteName as formatEliteName,
  getFamiliar,
  randomInRange,
  rollEncounter,
  roomRollSeed,
  scaleEnemy,
  seededRandom,
  selectEnemy,
  type Area,
  type BattleRewards,
  type BattleState,
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

function post(path: string, body: Record<string, unknown>, ip: string): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

const AREA: Area = {
  id: 'verdantMeadow',
  name: 'Verdant Meadow',
  description: '',
  levelRange: [1, 3],
  encounterPool: ['whiteDog', 'leafBunny', 'sparkMouse'],
  roomCount: 5,
  bossId: 'meadowGuardian',
  bossReward: { currency: 50, items: [] },
  bgColor: 0,
  baseFamiliar: 'honeyBear',
  unlocks: null,
};

function normalRoom(id: string, overrides: Partial<Room> = {}): Room {
  return {
    id,
    name: id,
    description: '',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 1,
    treasureChance: 0,
    treasurePool: [],
    cleared: false,
    ...overrides,
  };
}

function makeState(anonId: string, room: Room, seed = 1): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter'],
    activeParty: ['whiteDog', 'yellowFighter'],
    inventory: { currency: 0, items: [] },
    dungeon: {
      areaId: 'verdantMeadow',
      currentRoomId: 'room_1',
      party: ['whiteDog', 'yellowFighter'],
      partyHp: { whiteDog: 120, yellowFighter: 140 },
      partyMp: { whiteDog: 80, yellowFighter: 60 },
      rooms: {
        room_1: normalRoom('room_1', {
          cleared: true,
          encounterChance: 0,
          exits: [{ direction: Directions.North, roomId: room.id, label: room.name }],
        }),
        [room.id]: room,
      },
      seed,
      runLoot: { currency: 0, items: [] },
    },
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
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

/** Find a dungeon seed whose first-visit roll in this room produces an elite. */
function findEliteSeed(room: Room, area: Area): number {
  for (let seed = 1; seed < 100_000; seed++) {
    const rng = seededRandom(roomRollSeed(seed, room.id));
    if (!rollEncounter(room, rng)) continue;
    selectEnemy(area, rng);
    randomInRange(rng, area.levelRange[0], area.levelRange[1]);
    if (rng() < eliteChanceForRoom(room, area)) return seed;
  }
  throw new Error('No elite seed found');
}

describe('elite encounters', () => {
  it('rolls an elite into the persisted encounter and labels the explore response', async () => {
    const anonId = 'a1b2c3d4-1111-4222-8333-444455556666';
    const room = normalRoom('room_2');
    const seedValue = findEliteSeed(room, AREA);
    await seed(anonId, makeState(anonId, room, seedValue));

    const res = await fetchApp(
      post('/api/game/dungeon/explore', { anonymousId: anonId, roomId: 'room_2' }, '10.20.0.1')
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { encounter: boolean; enemy: string; elite?: string; eliteName?: string };
    expect(body.encounter).toBe(true);
    expect(body.elite).toBeDefined();
    expect(body.eliteName).toBe(formatEliteName(getFamiliar(body.enemy)!.name, body.elite!));

    const state = await readState(anonId);
    expect(state.dungeon!.rooms.room_2.pendingEncounter?.elite).toBe(body.elite);
  });

  it('applies the affix to the scaled enemy at battle start', async () => {
    const anonId = 'b2c3d4e5-2222-4333-8444-555566667777';
    const state = makeState(anonId, normalRoom('room_2'));
    state.dungeon!.currentRoomId = 'room_2';
    state.dungeon!.rooms.room_2.cleared = true;
    state.dungeon!.rooms.room_2.pendingEncounter = {
      enemyId: 'tideTurtle',
      resolved: false,
      level: 2,
      elite: 'hulking',
    };
    await seed(anonId, state);

    const res = await fetchApp(
      post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }, '10.20.0.2')
    );
    expect(res.status).toBe(200);
    const { battle } = (await res.json()) as { battle: BattleState };

    const expected = applyElite(scaleEnemy(getFamiliar('tideTurtle')!, 2), 'hulking');
    expect(battle.enemyFamiliar.elite).toBe('hulking');
    expect(battle.enemyFamiliar.familiarData.name).toBe('Hulking Tide Turtle');
    expect(battle.enemyFamiliar.familiarData.stats).toEqual(expected.stats);
    expect(battle.enemyFamiliar.currentHp).toBe(expected.stats.maxHp);
  });

  it('leaves an encounter without an elite unchanged', async () => {
    const anonId = 'c3d4e5f6-3333-4444-8555-666677778888';
    const state = makeState(anonId, normalRoom('room_2'));
    state.dungeon!.currentRoomId = 'room_2';
    state.dungeon!.rooms.room_2.cleared = true;
    state.dungeon!.rooms.room_2.pendingEncounter = { enemyId: 'tideTurtle', resolved: false, level: 2 };
    await seed(anonId, state);

    const res = await fetchApp(
      post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }, '10.20.0.3')
    );
    expect(res.status).toBe(200);
    const { battle } = (await res.json()) as { battle: BattleState };
    expect(battle.enemyFamiliar.elite).toBeUndefined();
    expect(battle.enemyFamiliar.familiarData.name).toBe('Tide Turtle');
    expect(battle.enemyFamiliar.familiarData.stats).toEqual(scaleEnemy(getFamiliar('tideTurtle')!, 2).stats);
  });

  it('pays an elite win double coins, bonus XP and a rare chest into run loot', async () => {
    const anonId = 'd4e5f607-4444-4555-8666-777788889999';
    const state = makeState(anonId, normalRoom('room_2'));
    state.dungeon!.currentRoomId = 'room_2';
    state.dungeon!.rooms.room_2.cleared = true;
    state.dungeon!.rooms.room_2.pendingEncounter = {
      enemyId: 'tideTurtle',
      resolved: false,
      level: 4,
      elite: 'armored',
    };
    await seed(anonId, state);

    const startRes = await fetchApp(
      post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }, '10.20.0.4')
    );
    expect(startRes.status).toBe(200);
    const { battle } = (await startRes.json()) as { battle: BattleState };
    expect(battle.enemyFamiliar.elite).toBe('armored');

    // One strike wins regardless of speed: the player survives any first hit.
    const db = (env as unknown as Bindings).DB;
    battle.playerFamiliar.currentHp = 9999;
    battle.enemyFamiliar.currentHp = 1;
    await db
      .prepare('UPDATE active_battles SET battle_json = ? WHERE battle_id = ? AND anonymous_id = ?')
      .bind(JSON.stringify(battle), battle.id, anonId)
      .run();

    const res = await fetchApp(
      post(
        '/api/game/battle/action',
        {
          anonymousId: anonId,
          battleId: battle.id,
          action: { type: ActionType.Attack },
          expectedTurnCount: 0,
        },
        '10.20.0.5'
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { turnResult: { rewards?: BattleRewards }; state: GameState };
    const rewards = body.turnResult.rewards!;

    expect(rewards.xp).toBe(Math.round(battleXp(4, false) * 1.5));
    expect(rewards.currency).toBeGreaterThanOrEqual(80);
    expect(rewards.currency).toBeLessThanOrEqual(138);
    expect(rewards.eliteChest).toBeDefined();
    expect(rewards.eliteChest!.items).toHaveLength(2);
    expect(rewards.eliteChest!.currency).toBeGreaterThanOrEqual(30);
    expect(rewards.eliteChest!.currency).toBeLessThanOrEqual(60);

    const runLoot = body.state.dungeon!.runLoot!;
    expect(runLoot.currency).toBe(rewards.currency + rewards.eliteChest!.currency);
    const lootIds = runLoot.items.map((entry) => entry.itemId);
    for (const itemId of rewards.eliteChest!.items) {
      expect(lootIds).toContain(itemId);
    }
  });
});
