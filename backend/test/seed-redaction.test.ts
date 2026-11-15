import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  BattleResult,
  RoomType,
  getFamiliar,
  type BattleFamiliar,
  type BattleState,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * RNG seeds must never reach the client: knowing a battle/dungeon seed lets the
 * client predict every roll and restart until it gets a favourable one. Seeds
 * stay in the persisted JSON (turn RNG and room replay depend on them); only
 * the response payload is sanitised.
 */

function makeEnv(environment = 'production'): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCombatant(familiarId: string, isAlly: boolean): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: data.stats.hp,
    currentMp: data.stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly,
  };
}

function makeState(anonId: string): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter'],
    activeParty: ['whiteDog', 'yellowFighter'],
    inventory: { currency: 100, items: [{ itemId: 'potion_small', quantity: 1 }] },
    dungeon: {
      areaId: 'verdantMeadow',
      currentRoomId: 'room-1',
      party: ['whiteDog', 'yellowFighter'],
      partyHp: { whiteDog: 120, yellowFighter: 140 },
      partyMp: { whiteDog: 80, yellowFighter: 60 },
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
          pendingEncounter: { enemyId: 'tideTurtle', resolved: false, level: 1 },
        },
      },
      seed: 12345,
    },
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
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

async function persistedDungeonSeed(anonId: string): Promise<number | undefined> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string }>();
  return (JSON.parse(row!.state_json) as GameState).dungeon?.seed;
}

describe('RNG seeds are stripped from responses', () => {
  it('state/load omits state.dungeon.seed but persists it', async () => {
    const anonId = crypto.randomUUID();
    await seedState(anonId, makeState(anonId));

    const res = await fetchApp(post('/api/game/state/load', { anonymousId: anonId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: GameState };
    expect(body.state.dungeon).toBeTruthy();
    expect(body.state.dungeon!.seed).toBeUndefined();

    // Persistence is untouched: exploration replay still has its seed.
    expect(await persistedDungeonSeed(anonId)).toBe(12345);
  });

  it('bootstrap omits both the resume battle seed and state.dungeon.seed', async () => {
    const anonId = crypto.randomUUID();
    await seedState(anonId, makeState(anonId));
    const battleId = crypto.randomUUID();
    const battle: BattleState = {
      id: battleId,
      roomId: 'room-1',
      playerFamiliar: makeCombatant('whiteDog', true),
      enemyFamiliar: makeCombatant('tideTurtle', false),
      isBoss: false,
      turnCount: 0,
      status: BattleResult.Active,
      swapsThisTurn: 0,
      seed: 777,
    };
    await (env as unknown as Bindings).DB.prepare(
      `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(battleId, anonId, JSON.stringify(battle))
      .run();

    const res = await fetchApp(post('/api/game/bootstrap', { anonymousId: anonId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: GameState; battle: BattleState };
    expect(body.state.dungeon!.seed).toBeUndefined();
    expect(body.battle.seed).toBeUndefined();

    // The persisted rows keep their seeds.
    expect(await persistedDungeonSeed(anonId)).toBe(12345);
    const row = await (env as unknown as Bindings).DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ?'
    )
      .bind(battleId)
      .first<{ battle_json: string }>();
    expect((JSON.parse(row!.battle_json) as BattleState).seed).toBe(777);
  });

  it('dungeon/enter omits the new dungeon seed but persists it', async () => {
    const anonId = crypto.randomUUID();
    const state = makeState(anonId);
    state.dungeon = null;
    await seedState(anonId, state);

    const res = await fetchApp(post('/api/game/dungeon/enter', { anonymousId: anonId, areaId: 'verdantMeadow' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dungeon: { seed?: number } };
    expect(body.dungeon.seed).toBeUndefined();

    expect(typeof (await persistedDungeonSeed(anonId))).toBe('number');
  });

  it('battle/start omits the battle seed but persists it', async () => {
    const anonId = crypto.randomUUID();
    await seedState(anonId, makeState(anonId));

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { battle: { id: string; seed?: number } };
    expect(body.battle.seed).toBeUndefined();

    const row = await (env as unknown as Bindings).DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ?'
    )
      .bind(body.battle.id)
      .first<{ battle_json: string }>();
    expect(typeof (JSON.parse(row!.battle_json) as BattleState).seed).toBe('number');
  });
});
