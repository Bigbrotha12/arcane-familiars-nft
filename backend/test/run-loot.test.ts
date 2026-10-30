import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  BattleResult,
  RoomType,
  getFamiliar,
  type BattleFamiliar,
  type BattleState,
  type GameState,
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

function combatant(familiarId: string, hp: number, mp: number): BattleFamiliar {
  const data = getFamiliar(familiarId)!;
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: hp,
    currentMp: mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: familiarId === 'yellowFighter',
  };
}

function makeState(anonId: string): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['yellowFighter'],
    activeParty: ['yellowFighter'],
    inventory: { currency: 100, items: [{ itemId: 'ether_small', quantity: 1 }] },
    dungeon: {
      areaId: 'verdantMeadow',
      currentRoomId: 'room-1',
      party: ['yellowFighter'],
      partyHp: { yellowFighter: 1 },
      partyMp: { yellowFighter: 60 },
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
          pendingEncounter: { enemyId: 'yellowFighter', resolved: false, level: 1 },
        },
      },
      seed: 1,
      runLoot: { currency: 50, items: [{ itemId: 'potion_small', quantity: 2 }] },
    },
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

async function seedBattle(anonId: string, battleId: string, isBoss = false): Promise<void> {
  const battle: BattleState = {
    id: battleId,
    roomId: 'room-1',
    playerFamiliar: combatant('yellowFighter', 1, 60),
    enemyFamiliar: combatant('yellowFighter', 999, 60),
    isBoss,
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

async function readState(anonId: string): Promise<GameState> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string }>();
  return JSON.parse(row!.state_json) as GameState;
}

describe('run loot', () => {
  it('discards run loot on defeat and leaves the bank intact', async () => {
    const anonId = 'anon-run-loot-loss';
    await seed(anonId, makeState(anonId));
    await seedBattle(anonId, 'battle-run-loot-loss');

    const res = await fetchApp(
      post(
        '/api/game/battle/action',
        {
          anonymousId: anonId,
          battleId: 'battle-run-loot-loss',
          action: { type: ActionType.Attack },
          expectedTurnCount: 0,
        },
        '10.8.0.1'
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      turnResult: { lostLoot?: { currency: number; items: { itemId: string }[] } };
      state: GameState;
    };
    expect(body.turnResult.lostLoot?.currency).toBe(50);
    expect(body.turnResult.lostLoot?.items).toEqual([{ itemId: 'potion_small', quantity: 2 }]);
    expect(body.state.inventory.currency).toBe(100);
    expect(body.state.inventory.items).toEqual([{ itemId: 'ether_small', quantity: 1 }]);
    expect(body.state.dungeon).toBeNull();
  });

  it('discards and reports run loot when a boss run is abandoned', async () => {
    const anonId = 'anon-run-loot-boss-abandon';
    await seed(anonId, makeState(anonId));
    await seedBattle(anonId, 'battle-run-loot-boss-abandon', true);

    const res = await fetchApp(
      post(
        '/api/game/battle/abandon',
        { anonymousId: anonId, battleId: 'battle-run-loot-boss-abandon', expectedTurnCount: 0 },
        '10.8.0.4'
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      forfeited: boolean;
      lostLoot?: { currency: number; items: { itemId: string; quantity: number }[] };
    };
    expect(body.forfeited).toBe(true);
    expect(body.lostLoot?.currency).toBe(50);
    expect(body.lostLoot?.items).toEqual([{ itemId: 'potion_small', quantity: 2 }]);
    const state = await readState(anonId);
    expect(state.dungeon).toBeNull();
    expect(state.inventory.currency).toBe(100);
  });

  it('banks run loot on exit', async () => {
    const anonId = 'anon-run-loot-exit';
    await seed(anonId, makeState(anonId));

    const res = await fetchApp(post('/api/game/dungeon/exit', { anonymousId: anonId }, '10.8.0.2'));
    expect(res.status).toBe(200);
    const state = await readState(anonId);
    expect(state.inventory.currency).toBe(150);
    expect(state.inventory.items).toEqual([
      { itemId: 'ether_small', quantity: 1 },
      { itemId: 'potion_small', quantity: 2 },
    ]);
    expect(state.dungeon).toBeNull();
  });

  it('rejects collecting treasure from a room the player is not in', async () => {
    const anonId = 'anon-run-loot-remote-room';
    const state = makeState(anonId);
    state.dungeon!.rooms['room-2'] = {
      ...state.dungeon!.rooms['room-1'],
      id: 'room-2',
      pendingEncounter: undefined,
      pendingTreasure: { itemId: 'fire_bomb', looted: false },
    };
    await seed(anonId, state);

    const res = await fetchApp(
      post(
        '/api/game/dungeon/collect-treasure',
        { anonymousId: anonId, roomId: 'room-2', itemId: 'fire_bomb' },
        '10.8.0.5'
      )
    );
    expect(res.status).toBe(400);
  });

  it('collects treasure into run loot, not the bank', async () => {
    const anonId = 'anon-run-loot-treasure';
    const state = makeState(anonId);
    state.dungeon!.rooms['room-1'].pendingEncounter = { enemyId: 'yellowFighter', resolved: true };
    state.dungeon!.rooms['room-1'].pendingTreasure = { itemId: 'fire_bomb', looted: false };
    await seed(anonId, state);

    const res = await fetchApp(
      post(
        '/api/game/dungeon/collect-treasure',
        { anonymousId: anonId, roomId: 'room-1', itemId: 'fire_bomb' },
        '10.8.0.3'
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { inventory: GameState['inventory']; runLoot: GameState['dungeon'] };
    expect(body.inventory).toEqual({ currency: 100, items: [{ itemId: 'ether_small', quantity: 1 }] });
    expect(body.runLoot?.items).toContainEqual({ itemId: 'fire_bomb', quantity: 1 });
  });
});
