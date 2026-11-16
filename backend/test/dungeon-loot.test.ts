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
  type Room,
} from '@arcane-familiars/game-logic';

/**
 * Dungeon loot at the HTTP layer:
 * - dead-end rooms carry a guaranteed rare chest (2 items + 30-60 coins)
 * - treasure rolls independently of encounters, but collect still waits for
 *   the room's fight to resolve
 * - old-shape pendingTreasure (itemId only) keeps working
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

function makeState(anonId: string, dungeon: DungeonState): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['yellowFighter'],
    activeParty: ['yellowFighter'],
    familiarLevels: { yellowFighter: 1 },
    inventory: { currency: 0, items: [] },
    dungeon,
    unlockedAreas: ['verdantMeadow'],
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

async function writeState(anonId: string, state: GameState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare('UPDATE game_states SET state_json = ? WHERE anonymous_id = ?')
    .bind(JSON.stringify(state), anonId)
    .run();
}

function makeDungeon(rooms: Record<string, Room>, currentRoomId = 'room_1'): DungeonState {
  return {
    areaId: 'verdantMeadow',
    currentRoomId,
    party: ['yellowFighter'],
    partyHp: { yellowFighter: 100 },
    partyMp: { yellowFighter: 60 },
    rooms,
    seed: 1234,
    runLoot: { currency: 10, items: [] },
  };
}

describe('dungeon loot', () => {
  it('gives a dead-end room a rare chest with two items and coins', async () => {
    const anonId = '2f5c5e1a-7a1e-4f8e-9c33-0c8f0a9b1d01';
    const dungeon = makeDungeon({
      room_1: room({
        id: 'room_1',
        exits: [{ direction: Directions.North, roomId: 'branch_1', label: 'Forgotten Cache' }],
      }),
      branch_1: room({
        id: 'branch_1',
        name: 'Forgotten Cache',
        type: RoomType.Deadend,
        cleared: false,
        chest: 'rare',
        encounterChance: 0,
        treasureChance: 1,
        treasurePool: [{ itemId: 'potion_small', weight: 10 }],
        exits: [{ direction: Directions.South, roomId: 'room_1', label: 'room_1' }],
      }),
    });
    await seed(anonId, makeState(anonId, dungeon));

    const res = await fetchApp(
      post('/api/game/dungeon/explore', { anonymousId: anonId, roomId: 'branch_1' }, '10.11.0.1')
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExploreResponse;

    expect(body.encounter).toBe(false);
    expect(body.treasure).toBe(true);
    expect(body.treasureTier).toBe('rare');
    expect(body.treasureItems).toHaveLength(2);
    expect(body.treasureCurrency).toBeGreaterThanOrEqual(30);
    expect(body.treasureCurrency).toBeLessThanOrEqual(60);
    expect(body.treasureItem).toBe(body.treasureItems![0]);

    const state = await readState(anonId);
    const pending = state.dungeon!.rooms.branch_1.pendingTreasure!;
    expect(pending.tier).toBe('rare');
    expect(pending.items).toEqual(body.treasureItems);
    expect(pending.currency).toBe(body.treasureCurrency);
    expect(pending.itemId).toBe(body.treasureItem);
    expect(pending.looted).toBe(false);
  });

  it('refuses to collect a guarded chest until the encounter is resolved', async () => {
    const anonId = '6d0c1e52-4b0d-4c5a-8f2e-9a7b3c1d2e02';
    const dungeon = makeDungeon({
      room_1: room({
        id: 'room_1',
        exits: [{ direction: Directions.East, roomId: 'room_2', label: 'room_2' }],
      }),
      room_2: room({
        id: 'room_2',
        type: RoomType.Deadend,
        cleared: false,
        chest: 'rare',
        encounterChance: 1,
        treasureChance: 1,
        treasurePool: [{ itemId: 'potion_small', weight: 10 }],
        exits: [{ direction: Directions.West, roomId: 'room_1', label: 'room_1' }],
      }),
    });
    await seed(anonId, makeState(anonId, dungeon));

    const explored = await fetchApp(
      post('/api/game/dungeon/explore', { anonymousId: anonId, roomId: 'room_2' }, '10.11.0.2')
    );
    expect(explored.status).toBe(200);
    const body = (await explored.json()) as ExploreResponse;
    expect(body.encounter).toBe(true);
    expect(body.enemy).not.toBeNull();
    expect(body.treasure).toBe(true);
    expect(body.treasureTier).toBe('rare');

    const itemId = body.treasureItems![0];
    const refused = await fetchApp(
      post('/api/game/dungeon/collect-treasure', { anonymousId: anonId, roomId: 'room_2', itemId }, '10.11.0.3')
    );
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain('Clear the encounter');

    // Win the fight (the battle route sets this on victory), then loot.
    const state = await readState(anonId);
    state.dungeon!.rooms.room_2.pendingEncounter!.resolved = true;
    await writeState(anonId, state);

    const collected = await fetchApp(
      post('/api/game/dungeon/collect-treasure', { anonymousId: anonId, roomId: 'room_2', itemId }, '10.11.0.4')
    );
    expect(collected.status).toBe(200);
    const collectedBody = (await collected.json()) as { runLoot: { currency: number; items: { itemId: string }[] } };
    expect(collectedBody.runLoot.currency).toBe(10 + body.treasureCurrency!);
    for (const chestItem of body.treasureItems!) {
      expect(collectedBody.runLoot.items).toContainEqual({ itemId: chestItem, quantity: 1 });
    }
  });

  it('collects exactly one item from old-shape pending treasure', async () => {
    const anonId = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c03';
    const dungeon = makeDungeon({
      room_1: room({
        id: 'room_1',
        pendingTreasure: { itemId: 'fire_bomb', looted: false },
      }),
    });
    await seed(anonId, makeState(anonId, dungeon));

    const res = await fetchApp(
      post(
        '/api/game/dungeon/collect-treasure',
        { anonymousId: anonId, roomId: 'room_1', itemId: 'fire_bomb' },
        '10.11.0.5'
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runLoot: { currency: number; items: { itemId: string; quantity: number }[] } };

    expect(body.runLoot.currency).toBe(10);
    expect(body.runLoot.items).toEqual([{ itemId: 'fire_bomb', quantity: 1 }]);
    const state = await readState(anonId);
    expect(state.dungeon!.rooms.room_1.pendingTreasure?.looted).toBe(true);
  });
});
