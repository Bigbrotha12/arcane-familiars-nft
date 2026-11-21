import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  Directions,
  RoomType,
  type DungeonState,
  type ExploreResponse,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * Rest shrine behaviour at the HTTP layer:
 * - the first visit heals living party members by the balance fraction, capped
 *   at their level-scaled max
 * - the heal is one-time per run (`room.rested`)
 * - fainted members are skipped and never revived
 */

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

function makeDungeon(): DungeonState {
  return {
    areaId: 'crystalCaves',
    currentRoomId: 'room_1',
    party: ['whiteDog', 'yellowFighter'],
    partyHp: { whiteDog: 100, yellowFighter: 30 },
    partyMp: { whiteDog: 60, yellowFighter: 0 },
    rooms: {
      room_1: {
        id: 'room_1',
        name: 'Approach',
        description: 'A plain room before the shrine.',
        type: RoomType.Normal,
        exits: [{ direction: Directions.North, roomId: 'room_2', label: 'Quiet Shrine' }],
        encounterChance: 0,
        treasureChance: 0,
        treasurePool: [],
        cleared: true,
      },
      room_2: {
        id: 'room_2',
        name: 'Quiet Shrine',
        description: 'Soft light pools around an old stone shrine.',
        type: RoomType.Rest,
        exits: [{ direction: Directions.South, roomId: 'room_1', label: 'Approach' }],
        encounterChance: 0,
        treasureChance: 0,
        treasurePool: [],
        cleared: false,
        rested: false,
      },
    },
    seed: 1,
  };
}

function makeState(anonId: string, dungeon: DungeonState = makeDungeon()): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter'],
    activeParty: ['whiteDog', 'yellowFighter'],
    familiarLevels: { whiteDog: 1, yellowFighter: 1 },
    inventory: { currency: 0, items: [] },
    dungeon,
    unlockedAreas: ['verdantMeadow', 'crystalCaves'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

async function seed(anonId: string, state: GameState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
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
  return JSON.parse(row!.state_json) as GameState;
}

async function explore(anonId: string, roomId: string, ip: string): Promise<ExploreResponse> {
  const res = await fetchApp(post('/api/game/dungeon/explore', { anonymousId: anonId, roomId }, ip));
  expect(res.status).toBe(200);
  return (await res.json()) as ExploreResponse;
}

describe('rest shrine exploration', () => {
  it('heals living party members on the first visit, capped at their max', async () => {
    const anonId = '1f7a1a2e-4c2e-4f6a-9a41-5e5f0d3c9a11';
    await seed(anonId, makeState(anonId));

    const body = await explore(anonId, 'room_2', '10.9.0.1');

    // White Dog is near max (only +20 HP/+20 MP fit); Yellow Fighter gets the
    // full 60% of its level-1 max (84 HP / 36 MP).
    expect(body.rest?.healed).toEqual({
      whiteDog: { hp: 20, mp: 20 },
      yellowFighter: { hp: 84, mp: 36 },
    });

    const state = await readState(anonId);
    expect(state.dungeon?.partyHp).toEqual({ whiteDog: 120, yellowFighter: 114 });
    expect(state.dungeon?.partyMp).toEqual({ whiteDog: 80, yellowFighter: 36 });
    expect(state.dungeon?.rooms['room_2'].rested).toBe(true);
  });

  it('heals only once per run', async () => {
    const anonId = 'a2c9b5d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
    await seed(anonId, makeState(anonId));

    await explore(anonId, 'room_2', '10.9.0.2');
    const afterFirst = await readState(anonId);

    // Step back out and return: the shrine is spent.
    await explore(anonId, 'room_1', '10.9.0.3');
    const body = await explore(anonId, 'room_2', '10.9.0.4');

    expect('rest' in body).toBe(false);
    const afterSecond = await readState(anonId);
    expect(afterSecond.dungeon?.partyHp).toEqual(afterFirst.dungeon?.partyHp);
    expect(afterSecond.dungeon?.partyMp).toEqual(afterFirst.dungeon?.partyMp);
  });

  it('skips fainted members and does not revive them', async () => {
    const anonId = '7d6e5f4a-3b2c-4d1e-9f8a-6b5c4d3e2f10';
    const dungeon = makeDungeon();
    dungeon.partyHp = { whiteDog: 40, yellowFighter: 0 };
    dungeon.partyMp = { whiteDog: 10, yellowFighter: 30 };
    await seed(anonId, makeState(anonId, dungeon));

    const body = await explore(anonId, 'room_2', '10.9.0.5');

    // 60% of White Dog's level-1 max: 72 HP / 48 MP.
    expect(body.rest?.healed.whiteDog).toEqual({ hp: 72, mp: 48 });
    expect(body.rest?.healed.yellowFighter).toBeUndefined();

    const state = await readState(anonId);
    expect(state.dungeon?.partyHp.yellowFighter).toBe(0);
    expect(state.dungeon?.partyMp.yellowFighter).toBe(30);
  });
});
