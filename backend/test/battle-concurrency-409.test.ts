import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import { getOrCreateGameState, saveGameStateIfVersion } from '../src/utils/saveManager';
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
 * Coverage for the 409 concurrency guards (production plan step 15):
 * - saveGameStateIfVersion must return false for a stale writer.
 * - the battle action route must reject a stale expectedTurnCount.
 * - two simultaneous identical actions must produce exactly one 200 and one
 *   409 (the batch write is conditional on the row each turn was computed
 *   from; the loser matches 0 rows and neither statement commits).
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

function makeCombatant(familiarId: string, hp: number, mp: number): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: hp,
    currentMp: mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: familiarId !== 'tideTurtle',
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

async function seedBattle(battleId: string, anonId: string, battle: BattleState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battleId, anonId, JSON.stringify(battle))
    .run();
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
    playerFamiliar: makeCombatant('yellowFighter', 140, 60),
    enemyFamiliar: makeCombatant('tideTurtle', 130, 70),
    isBoss: false,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
  };
}

describe('saveGameStateIfVersion optimistic concurrency', () => {
  it('writes on the current version and rejects a stale version without mutating the row', async () => {
    const db = (env as unknown as Bindings).DB;
    const anonId = 'anon-save-manager-unit';

    const loaded = await getOrCreateGameState(db, anonId, true);
    expect(loaded.version).toBe(1);

    // Current version → succeeds and bumps to 2.
    expect(await saveGameStateIfVersion(db, anonId, loaded.state, 1)).toBe(true);

    // Stale version → rejected, row untouched (still version 2).
    expect(await saveGameStateIfVersion(db, anonId, loaded.state, 1)).toBe(false);
    const after = await getOrCreateGameState(db, anonId, true);
    expect(after.version).toBe(2);

    // The now-current version 2 succeeds again.
    expect(await saveGameStateIfVersion(db, anonId, after.state, 2)).toBe(true);
    const final = await getOrCreateGameState(db, anonId, true);
    expect(final.version).toBe(3);
  });
});

describe('battle action: stale expectedTurnCount', () => {
  it('rejects an action submitted against a stale turn count (409)', async () => {
    const anonId = 'anon-stale-turn';
    await seedState(anonId, makeState(anonId));
    const battleId = 'battle-stale-turn';
    await seedBattle(battleId, anonId, makeActiveBattle(battleId));

    const attack = (expectedTurnCount?: number) =>
      fetchApp(
        post('/api/game/battle/action', {
          anonymousId: anonId,
          battleId,
          action: { type: ActionType.Attack },
          ...(expectedTurnCount === undefined ? {} : { expectedTurnCount }),
        })
      );

    const first = await attack(0);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { turnCount: number }).turnCount).toBe(1);

    // A second action carrying the stale expected turn count is rejected.
    const stale = await attack(0);
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: string }).error).toBe('Battle state is stale; please refresh and retry');

    // The current turn count is accepted.
    const second = await attack(1);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { turnCount: number }).turnCount).toBe(2);
  });

  it('rejects exactly one of two simultaneous identical actions (409)', async () => {
    const anonId = 'anon-simultaneous';
    await seedState(anonId, makeState(anonId));
    const battleId = 'battle-simultaneous';
    await seedBattle(battleId, anonId, makeActiveBattle(battleId));

    const body = {
      anonymousId: anonId,
      battleId,
      action: { type: ActionType.Attack },
      expectedTurnCount: 0,
    };
    const [a, b] = await Promise.all([
      fetchApp(post('/api/game/battle/action', body)),
      fetchApp(post('/api/game/battle/action', body)),
    ]);

    // Exactly one request wins; the loser matches 0 rows on its conditional
    // batch and responds 409 (either stale or concurrent — both are 409).
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    // The winning request advanced exactly one turn.
    const battleRow = await (env as unknown as Bindings).DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ?'
    )
      .bind(battleId)
      .first<{ battle_json: string }>();
    const persisted = JSON.parse(battleRow!.battle_json) as BattleState;
    expect(persisted.turnCount).toBe(1);
    expect(persisted.status).toBe(BattleResult.Active);

    const stateRow = await (env as unknown as Bindings).DB.prepare(
      'SELECT version FROM game_states WHERE anonymous_id = ?'
    )
      .bind(anonId)
      .first<{ version: number }>();
    expect(stateRow!.version).toBe(2);
  });
});
