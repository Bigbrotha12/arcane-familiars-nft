import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import { getOrCreateGameState, saveGameStateIfVersionNoBattle } from '../src/utils/saveManager';
import {
  BattleResult,
  RoomType,
  getFamiliar,
  type BattleFamiliar,
  type BattleState,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * Exploration/party mutations must not run while a battle is in flight. Without
 * the guard, a concurrent state write bumps the game_states version and an
 * in-flight battle action's state write no-ops while its battle write still
 * commits — losing the win/loss, rewards, and daily-cap increment.
 */

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: 'production' };
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

function makeState(anonId: string): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['yellowFighter', 'whiteDog'],
    activeParty: ['yellowFighter', 'whiteDog'],
    inventory: { currency: 100, items: [{ itemId: 'potion_small', quantity: 1 }] },
    dungeon: {
      areaId: 'verdantMeadow',
      currentRoomId: 'room-1',
      party: ['yellowFighter', 'whiteDog'],
      partyHp: { yellowFighter: 140, whiteDog: 120 },
      partyMp: { yellowFighter: 60, whiteDog: 80 },
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
          pendingTreasure: { itemId: 'potion_small', looted: false },
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

function makeActiveBattle(battleId: string): BattleState {
  return {
    id: battleId,
    playerFamiliar: makeCombatant('yellowFighter'),
    enemyFamiliar: makeCombatant('tideTurtle'),
    isBoss: false,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
  };
}

async function seedState(anonId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), 1)`
  )
    .bind(anonId, JSON.stringify(makeState(anonId)))
    .run();
}

async function seedBattle(battleId: string, anonId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battleId, anonId, JSON.stringify(makeActiveBattle(battleId)))
    .run();
}

const GUARD_ERROR = 'Cannot change dungeon state during an active battle';

describe('dungeon mutations are blocked during an active battle', () => {
  const endpoints = [
    { path: '/api/game/dungeon/explore', body: { roomId: 'room-1' } },
    { path: '/api/game/dungeon/collect-treasure', body: { roomId: 'room-1', itemId: 'potion_small' } },
    { path: '/api/game/dungeon/exit', body: {} },
  ];

  it.each(endpoints)('$path returns 409 while a battle is active', async ({ path, body }) => {
    const anonId = `anon-guard-${path.split('/').pop()}`;
    await seedState(anonId);
    await seedBattle(`battle-${path.split('/').pop()}`, anonId);

    const res = await fetchApp(post(path, { anonymousId: anonId, ...body }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(GUARD_ERROR);
  });

  it('allows the mutation once the battle row is gone', async () => {
    const anonId = 'anon-guard-released';
    await seedState(anonId);
    await seedBattle('battle-guard-released', anonId);

    // Blocked while the battle exists.
    expect((await fetchApp(post('/api/game/dungeon/exit', { anonymousId: anonId }))).status).toBe(409);

    // Remove the battle (as a completed battle would) and retry.
    await env.DB.prepare('DELETE FROM active_battles WHERE anonymous_id = ?').bind(anonId).run();
    const res = await fetchApp(post('/api/game/dungeon/exit', { anonymousId: anonId }));
    expect(res.status).toBe(200);
  });
});

describe('saveGameStateIfVersionNoBattle', () => {
  it('refuses to commit while a battle row exists, even at the current version', async () => {
    const db = env.DB;
    const anonId = 'anon-nobattle-unit';
    const loaded = await getOrCreateGameState(db, anonId, true);

    await db
      .prepare(
        `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
           VALUES (?, ?, ?, datetime('now'), datetime('now'))`
      )
      .bind('battle-nobattle-unit', anonId, JSON.stringify(makeActiveBattle('battle-nobattle-unit')))
      .run();

    const saved = await saveGameStateIfVersionNoBattle(db, anonId, loaded.state, loaded.version);
    expect(saved).toBe(false);

    const after = await getOrCreateGameState(db, anonId, true);
    expect(after.version).toBe(loaded.version);

    // Removing the battle lets the same write through.
    await db.prepare('DELETE FROM active_battles WHERE anonymous_id = ?').bind(anonId).run();
    expect(await saveGameStateIfVersionNoBattle(db, anonId, loaded.state, loaded.version)).toBe(true);
  });
});
