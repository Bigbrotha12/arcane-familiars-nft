import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  BattleResult,
  RoomType,
  getFamiliar,
  scaleFamiliarStats,
  type BattleFamiliar,
  type BattleState,
  type DungeonState,
  type GameState,
  type UseFieldItemResponse,
} from '@arcane-familiars/game-logic';

/**
 * Field item use at the HTTP layer:
 * - healing is capped at the level-scaled max and writes partyHp/partyMp
 * - run loot is consumed before the bank
 * - revive items mend every fallen member and ignore familiarId
 * - battle-only items, fainted heal targets and no-op heals are refused
 * - an active battle always wins (409)
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

function makeDungeon(overrides: Partial<DungeonState> = {}): DungeonState {
  return {
    areaId: 'verdantMeadow',
    currentRoomId: 'room_0',
    party: ['whiteDog', 'yellowFighter'],
    partyHp: { whiteDog: 120, yellowFighter: 140 },
    partyMp: { whiteDog: 80, yellowFighter: 60 },
    rooms: {
      room_0: {
        id: 'room_0',
        name: 'Entrance',
        description: 'The way in.',
        type: RoomType.Start,
        exits: [],
        encounterChance: 0,
        treasureChance: 0,
        treasurePool: [],
        cleared: true,
      },
    },
    seed: 1,
    ...overrides,
  };
}

function makeState(anonId: string, overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter'],
    activeParty: ['whiteDog', 'yellowFighter'],
    familiarLevels: { whiteDog: 1, yellowFighter: 1 },
    inventory: { currency: 0, items: [] },
    dungeon: makeDungeon(),
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
    ...overrides,
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

function makeCombatant(familiarId: string): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: data.stats.hp,
    currentMp: data.stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: true,
  };
}

async function seedBattle(battleId: string, anonId: string): Promise<void> {
  const battle: BattleState = {
    id: battleId,
    playerFamiliar: makeCombatant('whiteDog'),
    enemyFamiliar: makeCombatant('leafBunny'),
    isBoss: false,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
  };
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battleId, anonId, JSON.stringify(battle))
    .run();
}

async function useItem(anonId: string, body: Record<string, unknown>, ip = '10.11.0.1'): Promise<Response> {
  return fetchApp(post('/api/game/dungeon/use-item', { anonymousId: anonId, ...body }, ip));
}

describe('use item while exploring', () => {
  it('heals a chosen familiar and caps at its max HP', async () => {
    const anonId = crypto.randomUUID();
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'potion_small', quantity: 2 }] },
        dungeon: makeDungeon({ partyHp: { whiteDog: 100, yellowFighter: 140 } }),
      })
    );

    const res = await useItem(anonId, { itemId: 'potion_small', familiarId: 'whiteDog' }, '10.11.0.2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as UseFieldItemResponse;

    // 30 HP item, only 20 missing.
    expect(body.partyHp.whiteDog).toBe(120);
    expect(body.text).toBe('White Dog recovers 20 HP');
    expect(body.inventory.items).toEqual([{ itemId: 'potion_small', quantity: 1 }]);

    const state = await readState(anonId);
    expect(state.dungeon?.partyHp.whiteDog).toBe(120);
  });

  it('restores MP with an ether', async () => {
    const anonId = crypto.randomUUID();
    const maxMp = scaleFamiliarStats(getFamiliar('whiteDog')!.stats, 1).maxMp;
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'ether_small', quantity: 1 }] },
        dungeon: makeDungeon({ partyMp: { whiteDog: maxMp - 15, yellowFighter: 60 } }),
      })
    );

    const res = await useItem(anonId, { itemId: 'ether_small', familiarId: 'whiteDog' }, '10.11.0.3');
    expect(res.status).toBe(200);
    const body = (await res.json()) as UseFieldItemResponse;

    expect(body.partyMp.whiteDog).toBe(maxMp);
    expect(body.text).toBe('White Dog recovers 15 MP');
  });

  it('revives every fallen party member and ignores familiarId', async () => {
    const anonId = crypto.randomUUID();
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'phoenix_feather', quantity: 1 }] },
        dungeon: makeDungeon({ partyHp: { whiteDog: 0, yellowFighter: 0 } }),
      })
    );

    const res = await useItem(anonId, { itemId: 'phoenix_feather', familiarId: 'not-in-party' }, '10.11.0.4');
    expect(res.status).toBe(200);
    const body = (await res.json()) as UseFieldItemResponse;

    const expectedHp = Math.max(
      1,
      Math.floor((scaleFamiliarStats(getFamiliar('whiteDog')!.stats, 1).maxHp * 50) / 100)
    );
    expect(body.partyHp.whiteDog).toBe(expectedHp);
    expect(body.partyHp.yellowFighter).toBe(
      Math.max(1, Math.floor((scaleFamiliarStats(getFamiliar('yellowFighter')!.stats, 1).maxHp * 50) / 100))
    );
    expect(body.text).toContain('Phoenix Feather revives White Dog, Yellow Fighter');
  });

  it('refuses an item the player does not own', async () => {
    const anonId = crypto.randomUUID();
    await seed(anonId, makeState(anonId));

    const res = await useItem(anonId, { itemId: 'potion_small', familiarId: 'whiteDog' }, '10.11.0.5');
    expect(res.status).toBe(400);
  });

  it('refuses a battle-only item', async () => {
    const anonId = crypto.randomUUID();
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'fire_bomb', quantity: 1 }] },
      })
    );

    const res = await useItem(anonId, { itemId: 'fire_bomb', familiarId: 'whiteDog' }, '10.11.0.6');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('This item can only be used in battle');

    const state = await readState(anonId);
    expect(state.inventory.items).toEqual([{ itemId: 'fire_bomb', quantity: 1 }]);
  });

  it('refuses a fainted heal target', async () => {
    const anonId = crypto.randomUUID();
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'potion_small', quantity: 1 }] },
        dungeon: makeDungeon({ partyHp: { whiteDog: 0, yellowFighter: 140 } }),
      })
    );

    const res = await useItem(anonId, { itemId: 'potion_small', familiarId: 'whiteDog' }, '10.11.0.7');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('That familiar has fainted');
  });

  it('refuses a heal that would do nothing', async () => {
    const anonId = crypto.randomUUID();
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'potion_small', quantity: 1 }] },
      })
    );

    const res = await useItem(anonId, { itemId: 'potion_small', familiarId: 'whiteDog' }, '10.11.0.8');
    expect(res.status).toBe(400);

    const state = await readState(anonId);
    expect(state.inventory.items).toEqual([{ itemId: 'potion_small', quantity: 1 }]);
  });

  it('consumes run loot before the bank', async () => {
    const anonId = crypto.randomUUID();
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'potion_small', quantity: 1 }] },
        dungeon: makeDungeon({
          partyHp: { whiteDog: 100, yellowFighter: 140 },
          runLoot: { currency: 0, items: [{ itemId: 'potion_small', quantity: 2 }] },
        }),
      })
    );

    const res = await useItem(anonId, { itemId: 'potion_small', familiarId: 'whiteDog' }, '10.11.0.9');
    expect(res.status).toBe(200);
    const body = (await res.json()) as UseFieldItemResponse;

    expect(body.runLoot.items).toEqual([{ itemId: 'potion_small', quantity: 1 }]);
    expect(body.inventory.items).toEqual([{ itemId: 'potion_small', quantity: 1 }]);
  });

  it('returns 409 while a battle is active', async () => {
    const anonId = crypto.randomUUID();
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'potion_small', quantity: 1 }] },
        dungeon: makeDungeon({ partyHp: { whiteDog: 100, yellowFighter: 140 } }),
      })
    );
    await seedBattle(`battle-${anonId}`, anonId);

    const res = await useItem(anonId, { itemId: 'potion_small', familiarId: 'whiteDog' }, '10.11.0.10');
    expect(res.status).toBe(409);
  });

  it('returns 409 with no active dungeon', async () => {
    const anonId = crypto.randomUUID();
    await seed(
      anonId,
      makeState(anonId, {
        inventory: { currency: 0, items: [{ itemId: 'potion_small', quantity: 1 }] },
        dungeon: null,
      })
    );

    const res = await useItem(anonId, { itemId: 'potion_small', familiarId: 'whiteDog' }, '10.11.0.11');
    expect(res.status).toBe(409);
  });
});
