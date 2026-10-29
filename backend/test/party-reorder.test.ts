import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  BattleResult,
  RoomType,
  getFamiliar,
  type BattleState,
  type DungeonState,
  type GameState,
  type Room,
} from '@arcane-familiars/game-logic';

/**
 * Coverage for party reordering (production plan step 15): the
 * /game/state/party/active endpoint promotes a familiar to the lead. It is the
 * only party mutation allowed mid-dungeon; membership changes and reorders
 * during an active battle are rejected.
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

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

async function stateVersion(anonId: string): Promise<number | null> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT version FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ version: number }>();
  return row?.version ?? null;
}

function makeRoom(id: string): Room {
  return {
    id,
    name: `Room ${id}`,
    description: 'Test room',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: true,
  };
}

function makeDungeon(party: string[], partyHp: Record<string, number>): DungeonState {
  return {
    areaId: 'verdantMeadow',
    currentRoomId: 'room-1',
    party: [...party],
    partyHp: { ...partyHp },
    partyMp: { yellowFighter: 60, whiteDog: 80 },
    rooms: { 'room-1': makeRoom('room-1') },
    seed: 1,
  };
}

function makeOutOfDungeonState(anonId: string): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter', 'aquaSprite'],
    activeParty: ['whiteDog', 'yellowFighter'],
    inventory: { currency: 100, items: [] },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

function makeInDungeonState(anonId: string): GameState {
  const state = makeOutOfDungeonState(anonId);
  state.dungeon = makeDungeon(['whiteDog', 'yellowFighter'], { whiteDog: 120, yellowFighter: 140 });
  return state;
}

describe('party reordering: /game/state/party/active', () => {
  it('promotes a non-lead familiar to the lead and persists a version bump', async () => {
    const anonId = 'anon-reorder-lead';
    await seedState(anonId, makeOutOfDungeonState(anonId));

    const res = await fetchApp(
      post('/api/game/state/party/active', { anonymousId: anonId, familiarId: 'yellowFighter' })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; state: GameState };
    expect(body.success).toBe(true);
    expect(body.state.activeParty).toEqual(['yellowFighter', 'whiteDog']);
    expect(await stateVersion(anonId)).toBe(2);
  });

  it('is a no-op when the familiar already leads and does not bump the version', async () => {
    const anonId = 'anon-reorder-noop';
    await seedState(anonId, makeOutOfDungeonState(anonId));

    // First call makes yellowFighter the lead.
    const first = await fetchApp(
      post('/api/game/state/party/active', { anonymousId: anonId, familiarId: 'yellowFighter' })
    );
    expect(first.status).toBe(200);

    // Re-leading the same familiar is a no-op: identical success, no write.
    const second = await fetchApp(
      post('/api/game/state/party/active', { anonymousId: anonId, familiarId: 'yellowFighter' })
    );
    expect(second.status).toBe(200);
    const body = (await second.json()) as { success: boolean; state: GameState };
    expect(body.state.activeParty).toEqual(['yellowFighter', 'whiteDog']);
    expect(await stateVersion(anonId)).toBe(2);
  });

  it('rejects a familiar that is not in the active party', async () => {
    const anonId = 'anon-reorder-not-in-party';
    await seedState(anonId, makeOutOfDungeonState(anonId));

    const res = await fetchApp(post('/api/game/state/party/active', { anonymousId: anonId, familiarId: 'aquaSprite' }));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Familiar is not in your active party');
    expect(await stateVersion(anonId)).toBe(1);
  });

  it('reorders dungeon.party identically mid-run without touching party HP', async () => {
    const anonId = 'anon-reorder-mid-dungeon';
    await seedState(anonId, makeInDungeonState(anonId));

    const res = await fetchApp(
      post('/api/game/state/party/active', { anonymousId: anonId, familiarId: 'yellowFighter' })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: GameState };
    expect(body.state.activeParty).toEqual(['yellowFighter', 'whiteDog']);
    expect(body.state.dungeon?.party).toEqual(['yellowFighter', 'whiteDog']);
    // Per-member HP is keyed by id and must be untouched by a reorder.
    expect(body.state.dungeon?.partyHp).toEqual({ whiteDog: 120, yellowFighter: 140 });
    expect(await stateVersion(anonId)).toBe(2);
  });

  it('rejects promoting a fainted familiar to the lead mid-run', async () => {
    const anonId = 'anon-reorder-fainted';
    const state = makeInDungeonState(anonId);
    state.dungeon!.partyHp['yellowFighter'] = 0;
    await seedState(anonId, state);

    const res = await fetchApp(
      post('/api/game/state/party/active', { anonymousId: anonId, familiarId: 'yellowFighter' })
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Cannot make a fainted familiar the lead');
  });

  it('rejects reordering during an active battle', async () => {
    const anonId = 'anon-reorder-in-battle';
    await seedState(anonId, makeOutOfDungeonState(anonId));

    const battleId = 'battle-blocking-reorder';
    const data = getFamiliar('whiteDog')!;
    await seedBattle(battleId, anonId, {
      id: battleId,
      playerFamiliar: {
        uid: 'u-whiteDog',
        familiarData: data,
        currentHp: data.stats.hp,
        currentMp: data.stats.mp,
        statusEffects: [],
        cooldowns: {},
        isAlly: true,
      },
      enemyFamiliar: {
        uid: 'u-tideTurtle',
        familiarData: getFamiliar('tideTurtle')!,
        currentHp: 130,
        currentMp: 70,
        statusEffects: [],
        cooldowns: {},
        isAlly: false,
      },
      isBoss: false,
      turnCount: 0,
      status: BattleResult.Active,
      swapsThisTurn: 0,
      seed: 1,
    });

    const res = await fetchApp(
      post('/api/game/state/party/active', { anonymousId: anonId, familiarId: 'yellowFighter' })
    );

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('Cannot swap party during an active battle');
  });
});

describe('party membership changes: /game/state/party', () => {
  it('is rejected mid-dungeon (409)', async () => {
    const anonId = 'anon-party-change-in-dungeon';
    await seedState(anonId, makeInDungeonState(anonId));

    const res = await fetchApp(
      post('/api/game/state/party', {
        anonymousId: anonId,
        activeParty: ['aquaSprite', 'whiteDog'],
      })
    );

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('Cannot change party while in a dungeon');
  });
});
