import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  Directions,
  RoomType,
  getFamiliar,
  scaleEnemy,
  type Area,
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

function post(path: string, body: Record<string, unknown>, ip = '10.30.0.1'): Request {
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

const MIN_LEVEL = AREA.levelRange[0];

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

function makeState(anonId: string, room: Room, seed = 1, wins = 0): GameState {
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
    battleCount: wins,
    winCount: wins,
    lastSaved: 0,
  };
}

async function seed(anonId: string, state: GameState): Promise<void> {
  const db = (env as unknown as Bindings).DB;
  await db.prepare('DELETE FROM active_battles WHERE anonymous_id = ?').bind(anonId).run();
  await db.prepare('DELETE FROM game_states WHERE anonymous_id = ?').bind(anonId).run();
  await db
    .prepare(
      `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), 1)`
    )
    .bind(anonId, JSON.stringify(state))
    .run();
}

async function readState(anonId: string): Promise<GameState> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string }>();
  if (!row) throw new Error(`No game_states row for ${anonId}`);
  return JSON.parse(row.state_json) as GameState;
}

async function writeState(anonId: string, state: GameState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare('UPDATE game_states SET state_json = ? WHERE anonymous_id = ?')
    .bind(JSON.stringify(state), anonId)
    .run();
}

interface ExploreBody {
  room: Room;
  encounter: boolean;
  enemy: string | null;
  elite?: string;
  eliteName?: string;
}

async function explore(anonId: string): Promise<ExploreBody> {
  const res = await fetchApp(post('/api/game/dungeon/explore', { anonymousId: anonId, roomId: 'room_2' }));
  expect(res.status).toBe(200);
  return (await res.json()) as ExploreBody;
}

const ANON_ID = '9f1c2a30-1111-4222-8333-444455556666';
const MAX_SEEDS = 120;

describe('guided first battle: exploration', () => {
  it("scales a new player's encounter to the area minimum and never rolls an elite", async () => {
    for (let seedValue = 1; seedValue <= 40; seedValue++) {
      const state = makeState(ANON_ID, normalRoom('room_2'), seedValue);
      await seed(ANON_ID, state);

      const body = await explore(ANON_ID);
      expect(body.encounter).toBe(true);
      expect(body.elite).toBeUndefined();
      expect(body.room.pendingEncounter?.level).toBe(MIN_LEVEL);

      const persisted = await readState(ANON_ID);
      expect(persisted.dungeon!.rooms.room_2.pendingEncounter?.elite).toBeUndefined();
      expect(persisted.dungeon!.rooms.room_2.pendingEncounter?.level).toBe(MIN_LEVEL);
    }
  });

  it('never rolls an elite below the win gate, and still can once it is met', async () => {
    for (let seedValue = 1; seedValue <= 40; seedValue++) {
      const state = makeState(ANON_ID, normalRoom('room_2'), seedValue, 2);
      await seed(ANON_ID, state);
      const body = await explore(ANON_ID);
      expect(body.elite).toBeUndefined();
      expect(body.room.pendingEncounter?.elite).toBeUndefined();
    }

    let eliteSeed = -1;
    for (let seedValue = 1; seedValue <= MAX_SEEDS && eliteSeed === -1; seedValue++) {
      const state = makeState(ANON_ID, normalRoom('room_2'), seedValue, 3);
      await seed(ANON_ID, state);
      const body = await explore(ANON_ID);
      if (body.elite) eliteSeed = seedValue;
    }
    expect(eliteSeed).toBeGreaterThan(0);
  });
});

describe('guided first battle: battle start', () => {
  it('starts a new player at the area minimum with guided set', async () => {
    const state = makeState(ANON_ID, normalRoom('room_2'));
    state.dungeon!.currentRoomId = 'room_2';
    state.dungeon!.rooms.room_2.cleared = true;
    state.dungeon!.rooms.room_2.pendingEncounter = { enemyId: 'tideTurtle', resolved: false, level: 3 };
    await seed(ANON_ID, state);

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: ANON_ID, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const { battle } = (await res.json()) as { battle: BattleState };

    expect(battle.guided).toBe(true);
    expect(battle.enemyLevel).toBe(MIN_LEVEL);
    expect(battle.enemyFamiliar.familiarData.stats).toEqual(scaleEnemy(getFamiliar('tideTurtle')!, MIN_LEVEL).stats);
    // Sanitized for the client, but guided survives.
    expect(battle).not.toHaveProperty('seed');
  });

  it('strips an elite from a legacy pending encounter for a new player', async () => {
    const state = makeState(ANON_ID, normalRoom('room_2'));
    state.dungeon!.currentRoomId = 'room_2';
    state.dungeon!.rooms.room_2.cleared = true;
    state.dungeon!.rooms.room_2.pendingEncounter = {
      enemyId: 'tideTurtle',
      resolved: false,
      level: 2,
      elite: 'hulking',
    };
    await seed(ANON_ID, state);

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: ANON_ID, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const { battle } = (await res.json()) as { battle: BattleState };

    expect(battle.guided).toBe(true);
    expect(battle.enemyLevel).toBe(MIN_LEVEL);
    expect(battle.enemyFamiliar.elite).toBeUndefined();
    expect(battle.enemyFamiliar.familiarData.name).toBe('Tide Turtle');
  });

  it('does not guide a player who has already finished a battle', async () => {
    const state = makeState(ANON_ID, normalRoom('room_2'), 1, 1);
    state.dungeon!.currentRoomId = 'room_2';
    state.dungeon!.rooms.room_2.cleared = true;
    state.dungeon!.rooms.room_2.pendingEncounter = { enemyId: 'tideTurtle', resolved: false, level: 2 };
    await seed(ANON_ID, state);

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: ANON_ID, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const { battle } = (await res.json()) as { battle: BattleState };

    expect(battle.guided).toBeUndefined();
    expect(battle.enemyLevel).toBe(2);
  });

  it('stops guiding after the guided battle is won', async () => {
    const state = makeState(ANON_ID, normalRoom('room_2'));
    state.dungeon!.currentRoomId = 'room_2';
    state.dungeon!.rooms.room_2.cleared = true;
    state.dungeon!.rooms.room_2.pendingEncounter = { enemyId: 'tideTurtle', resolved: false, level: 1 };
    await seed(ANON_ID, state);

    const startRes = await fetchApp(
      post('/api/game/battle/start', { anonymousId: ANON_ID, playerFamiliarId: 'whiteDog' }, '10.30.0.2')
    );
    expect(startRes.status).toBe(200);
    const { battle } = (await startRes.json()) as { battle: BattleState };
    expect(battle.guided).toBe(true);

    // One strike wins regardless of speed.
    const db = (env as unknown as Bindings).DB;
    battle.playerFamiliar.currentHp = 9999;
    battle.enemyFamiliar.currentHp = 1;
    await db
      .prepare('UPDATE active_battles SET battle_json = ? WHERE battle_id = ? AND anonymous_id = ?')
      .bind(JSON.stringify(battle), battle.id, ANON_ID)
      .run();

    const winRes = await fetchApp(
      post(
        '/api/game/battle/action',
        {
          anonymousId: ANON_ID,
          battleId: battle.id,
          action: { type: ActionType.Attack },
          expectedTurnCount: 0,
        },
        '10.30.0.3'
      )
    );
    expect(winRes.status).toBe(200);

    const after = await readState(ANON_ID);
    expect(after.battleCount).toBe(1);
    expect(after.winCount).toBe(1);
    after.dungeon!.currentRoomId = 'room_2';
    after.dungeon!.rooms.room_2.pendingEncounter = { enemyId: 'leafBunny', resolved: false, level: 2 };
    await writeState(ANON_ID, after);

    const nextRes = await fetchApp(
      post('/api/game/battle/start', { anonymousId: ANON_ID, playerFamiliarId: 'whiteDog' }, '10.30.0.4')
    );
    expect(nextRes.status).toBe(200);
    const next = (await nextRes.json()) as { battle: BattleState };
    expect(next.battle.guided).toBeUndefined();
    expect(next.battle.enemyLevel).toBe(2);
  });
});
