import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  CURIOS,
  Directions,
  RoomType,
  resolveCurioOption,
  roomRollSeed,
  seededRandom,
  type CurioOutcome,
  type CurioResponse,
  type DungeonState,
  type GameState,
  type Room,
} from '@arcane-familiars/game-logic';

/**
 * Curio use at the HTTP layer:
 * - requirements are enforced before any cost is paid
 * - a curio is single-use and old rooms without one are rejected
 * - deterministic outcome per dungeon seed + room
 * - hurt never KOs, chests land in run loot, ambushes create a real encounter
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

let ipSuffix = 0;
function nextIp(): string {
  ipSuffix += 1;
  return `10.77.${Math.floor(ipSuffix / 200)}.${ipSuffix % 200}`;
}

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': nextIp() },
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

function makeDungeon(curioId: string | undefined, seed: number, areaId = 'verdantMeadow'): DungeonState {
  return {
    areaId,
    currentRoomId: 'room_1',
    party: ['whiteDog'],
    partyHp: { whiteDog: 100 },
    partyMp: { whiteDog: 60 },
    rooms: {
      room_1: room({
        id: 'room_1',
        curio: curioId ? { id: curioId, used: false } : undefined,
        exits: [{ direction: Directions.North, roomId: 'room_0', label: 'Entrance' }],
      }),
    },
    seed,
    runLoot: { currency: 10, items: [] },
  };
}

function makeState(anonId: string, dungeon: DungeonState, bankCurrency = 0): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog'],
    activeParty: ['whiteDog'],
    familiarLevels: { whiteDog: 1 },
    familiarXp: {},
    inventory: { currency: bankCurrency, items: [] },
    dungeon,
    unlockedAreas: ['verdantMeadow', 'shadowForest', 'emberHollow'],
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

/** Smallest seed whose deterministic roll for this option matches `predicate`. */
function findSeed(
  curioId: string,
  optionId: string,
  predicate: (outcome: CurioOutcome) => boolean,
  roomId = 'room_1'
): number {
  const curio = CURIOS[curioId];
  for (let seed = 1; seed <= 5000; seed++) {
    const resolution = resolveCurioOption(curio, optionId, seededRandom(roomRollSeed(seed, `${roomId}:curio`)));
    if (resolution && predicate(resolution.outcome)) return seed;
  }
  throw new Error(`No seed found for ${curioId}/${optionId}`);
}

function useCurio(anonId: string, roomId: string, optionId: string): Promise<Response> {
  return fetchApp(post('/api/game/dungeon/curio', { anonymousId: anonId, roomId, optionId }));
}

describe('curio use', () => {
  it('rejects an item-costed option without the item and leaves the curio unused', async () => {
    const anonId = 'e1a2b3c4-1111-4a2b-8c3d-000000000001';
    await seed(anonId, makeState(anonId, makeDungeon('mossyShrine', 1)));

    const res = await useCurio(anonId, 'room_1', 'offerPotion');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('Small Potion');

    const state = await readState(anonId);
    expect(state.dungeon!.rooms.room_1.curio!.used).toBe(false);
  });

  it('rejects a coin-costed option when run loot plus bank cannot pay', async () => {
    const anonId = 'e1a2b3c4-1111-4a2b-8c3d-000000000002';
    await seed(anonId, makeState(anonId, makeDungeon('strangeAltar', 1, 'shadowForest'), 20));

    const res = await useCurio(anonId, 'room_1', 'offerCoins');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('60');
  });

  it('pays coin costs from run loot before the bank', async () => {
    const anonId = 'e1a2b3c4-1111-4a2b-8c3d-000000000003';
    await seed(anonId, makeState(anonId, makeDungeon('strangeAltar', 1, 'shadowForest'), 100));

    const res = await useCurio(anonId, 'room_1', 'offerCoins');
    expect(res.status).toBe(200);
    const body = (await res.json()) as CurioResponse;
    expect(body.success).toBe(true);

    const state = await readState(anonId);
    // The 10 run-loot coins go first, then 50 of the 100 banked coins.
    expect(state.inventory.currency).toBe(50);
  });

  it('allows a curio to be used only once', async () => {
    const anonId = 'e1a2b3c4-1111-4a2b-8c3d-000000000004';
    await seed(anonId, makeState(anonId, makeDungeon('mossyShrine', 3)));

    const first = await useCurio(anonId, 'room_1', 'pray');
    expect(first.status).toBe(200);
    expect(((await first.json()) as CurioResponse).success).toBe(true);

    const second = await useCurio(anonId, 'room_1', 'pray');
    expect(second.status).toBe(400);
    expect(((await second.json()) as { error: string }).error).toContain('already');

    const state = await readState(anonId);
    expect(state.dungeon!.rooms.room_1.curio!.used).toBe(true);
  });

  it('never drops a living party member below 1 HP on a hurt outcome', async () => {
    const seedValue = findSeed('strangeAltar', 'touchRunes', (outcome) => outcome.kind === 'hurtParty');
    const anonId = 'e1a2b3c4-1111-4a2b-8c3d-000000000005';
    const dungeon = makeDungeon('strangeAltar', seedValue, 'shadowForest');
    dungeon.partyHp = { whiteDog: 5 };
    await seed(anonId, makeState(anonId, dungeon));

    const res = await useCurio(anonId, 'room_1', 'touchRunes');
    expect(res.status).toBe(200);
    const body = (await res.json()) as CurioResponse;
    expect(body.outcome.kind).toBe('hurtParty');
    expect(body.gains.hurt?.whiteDog).toBeGreaterThan(0);

    const state = await readState(anonId);
    expect(state.dungeon!.partyHp.whiteDog).toBe(1);
  });

  it('turns an ambush into a normal, resolvable encounter', async () => {
    const seedValue = findSeed('familiarNest', 'approach', (outcome) => outcome.kind === 'ambush');
    const anonId = 'e1a2b3c4-1111-4a2b-8c3d-000000000006';
    await seed(anonId, makeState(anonId, makeDungeon('familiarNest', seedValue)));

    const res = await useCurio(anonId, 'room_1', 'approach');
    expect(res.status).toBe(200);
    const body = (await res.json()) as CurioResponse;
    expect(body.encounter).toBe(true);
    expect(body.enemy).toBeTruthy();

    const state = await readState(anonId);
    const pending = state.dungeon!.rooms.room_1.pendingEncounter!;
    expect(pending.enemyId).toBe(body.enemy);
    expect(pending.resolved).toBe(false);
    expect(typeof pending.level).toBe('number');

    const battle = await fetchApp(
      post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' })
    );
    expect(battle.status).toBe(200);
  });

  it('puts chest contents straight into run loot', async () => {
    const seedValue = findSeed('emberBrazier', 'reach', (outcome) => outcome.kind === 'chest');
    const anonId = 'e1a2b3c4-1111-4a2b-8c3d-000000000007';
    await seed(anonId, makeState(anonId, makeDungeon('emberBrazier', seedValue, 'emberHollow')));

    const res = await useCurio(anonId, 'room_1', 'reach');
    expect(res.status).toBe(200);
    const body = (await res.json()) as CurioResponse;
    expect(body.outcome.kind).toBe('chest');
    expect(body.gains.items?.length).toBeGreaterThan(0);
    expect(body.runLoot.currency).toBeGreaterThan(10);
    for (const itemId of body.gains.items ?? []) {
      expect(body.runLoot.items).toContainEqual({ itemId, quantity: expect.any(Number) });
    }
  });

  it('resolves the same outcome for the same seed and room', async () => {
    const first = 'e1a2b3c4-1111-4a2b-8c3d-000000000008';
    const second = 'e1a2b3c4-1111-4a2b-8c3d-000000000009';
    await seed(first, makeState(first, makeDungeon('abandonedPack', 4321)));
    await seed(second, makeState(second, makeDungeon('abandonedPack', 4321)));

    const a = (await (await useCurio(first, 'room_1', 'search')).json()) as CurioResponse;
    const b = (await (await useCurio(second, 'room_1', 'search')).json()) as CurioResponse;

    expect(a.outcome).toEqual(b.outcome);
    expect(a.text).toBe(b.text);
    expect(a.enemy).toBe(b.enemy);
  });

  it('rejects an old room that has no curio', async () => {
    const anonId = 'e1a2b3c4-1111-4a2b-8c3d-00000000000a';
    await seed(anonId, makeState(anonId, makeDungeon(undefined, 1)));

    const res = await useCurio(anonId, 'room_1', 'pray');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('no curio');
  });
});
