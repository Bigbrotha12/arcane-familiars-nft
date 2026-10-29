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

/**
 * Integrity regressions for the battle loop:
 * - one active battle per player; restart is rejected (no free heal)
 * - a win resolves the room the battle was started in
 * - abandon/exit clear the battle row and preserve attrition
 * - dungeon mutations are blocked during a battle
 * - 0-HP starts, invalid targets, and useless items are rejected
 * - bootstrap deletes an orphaned battle
 */

function makeEnv(environment = 'development'): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request, environment = 'development'): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(environment), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body: Record<string, unknown>, ip = '10.0.0.1'): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

function get(path: string, ip = '10.0.0.1'): Request {
  return new Request(`https://example.com${path}`, { headers: { 'CF-Connecting-IP': ip } });
}

function makeCombatant(familiarId: string, hp: number, mp: number, isAlly: boolean): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: hp,
    currentMp: mp,
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
    inventory: { currency: 100, items: [{ itemId: 'potion_small', quantity: 3 }] },
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
      seed: 1,
    },
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

function makeBattle(battleId: string, roomId = 'room-1'): BattleState {
  return {
    id: battleId,
    roomId,
    playerFamiliar: makeCombatant('whiteDog', 120, 80, true),
    enemyFamiliar: makeCombatant('tideTurtle', 1, 70, false),
    isBoss: false,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
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
  return JSON.parse(row!.state_json) as GameState;
}

async function battleCount(anonId: string): Promise<number> {
  const row = await (env as unknown as Bindings).DB.prepare(
    'SELECT COUNT(*) AS n FROM active_battles WHERE anonymous_id = ?'
  )
    .bind(anonId)
    .first<{ n: number }>();
  return row!.n;
}

describe('battle integrity', () => {
  it('rejects a second start while a battle is active', async () => {
    const anonId = 'anon-restart';
    const battle = makeBattle('battle-restart');
    await seed(anonId, makeState(anonId), battle);

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('BATTLE_ACTIVE');
  });

  it('resolves the room the battle belongs to, not the current room', async () => {
    const anonId = 'anon-room-bind';
    const state = makeState(anonId);
    state.dungeon!.rooms['room-2'] = {
      ...state.dungeon!.rooms['room-1'],
      id: 'room-2',
      pendingEncounter: { enemyId: 'leafBunny', resolved: false, level: 1 },
    };
    state.dungeon!.currentRoomId = 'room-2';
    const battle = makeBattle('battle-room-bind', 'room-1');
    await seed(anonId, state, battle);

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId: battle.id,
        action: { type: ActionType.Attack },
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(200);

    const after = await readState(anonId);
    expect(after.dungeon!.rooms['room-1'].pendingEncounter?.resolved).toBe(true);
    expect(after.dungeon!.rooms['room-2'].pendingEncounter?.resolved).toBe(false);
  });

  it('persists HP/MP on abandon and clears the battle row', async () => {
    const anonId = 'anon-abandon';
    const battle = makeBattle('battle-abandon');
    battle.playerFamiliar.currentHp = 42;
    battle.playerFamiliar.currentMp = 17;
    await seed(anonId, makeState(anonId), battle);

    const res = await fetchApp(
      post('/api/game/battle/abandon', {
        anonymousId: anonId,
        battleId: battle.id,
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(200);
    expect(await battleCount(anonId)).toBe(0);
    const after = await readState(anonId);
    expect(after.dungeon!.partyHp.whiteDog).toBe(42);
    expect(after.dungeon!.partyMp.whiteDog).toBe(17);
  });

  it('allows exit after abandoning the battle', async () => {
    const anonId = 'anon-exit';
    const battle = makeBattle('battle-exit');
    await seed(anonId, makeState(anonId), battle);

    // Exit is blocked while the battle row is live; abandon first.
    const blocked = await fetchApp(post('/api/game/dungeon/exit', { anonymousId: anonId }));
    expect(blocked.status).toBe(409);

    const abandon = await fetchApp(
      post('/api/game/battle/abandon', {
        anonymousId: anonId,
        battleId: battle.id,
        expectedTurnCount: 0,
      })
    );
    expect(abandon.status).toBe(200);

    const res = await fetchApp(post('/api/game/dungeon/exit', { anonymousId: anonId }));
    expect(res.status).toBe(200);
    expect(await battleCount(anonId)).toBe(0);
    expect((await readState(anonId)).dungeon).toBeNull();
  });

  it('blocks exploration during a battle', async () => {
    const anonId = 'anon-block-explore';
    await seed(anonId, makeState(anonId), makeBattle('battle-block-explore'));

    const res = await fetchApp(post('/api/game/dungeon/explore', { anonymousId: anonId, roomId: 'room-1' }));
    expect(res.status).toBe(409);
  });

  it('rejects a 0-HP lead at start', async () => {
    const anonId = 'anon-zero-hp';
    const state = makeState(anonId);
    state.dungeon!.partyHp.whiteDog = 0;
    await seed(anonId, state);

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('FAMILIAR_FAINTED');
  });

  it('rejects a full-HP potion without consuming it', async () => {
    const anonId = 'anon-full-hp-potion';
    await seed(anonId, makeState(anonId), makeBattle('battle-full-hp-potion'));

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId: 'battle-full-hp-potion',
        action: { type: ActionType.Item, itemId: 'potion_small' },
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Item would have no effect');
    expect((await readState(anonId)).inventory.items[0].quantity).toBe(3);
  });

  it('rejects an attack targeted at the player', async () => {
    const anonId = 'anon-bad-target';
    await seed(anonId, makeState(anonId), makeBattle('battle-bad-target'));

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId: 'battle-bad-target',
        action: { type: ActionType.Attack, targetId: 'u-whiteDog' },
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Invalid target');
  });

  it('cleans an orphaned battle on bootstrap', async () => {
    const anonId = 'anon-orphan-bootstrap';
    const state = makeState(anonId);
    state.dungeon = null;
    await seed(anonId, state, makeBattle('battle-orphan'));

    const res = await fetchApp(get(`/api/game/bootstrap?anonymousId=${anonId}`));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { battle: unknown }).battle).toBeNull();
    expect(await battleCount(anonId)).toBe(0);
  });
});
