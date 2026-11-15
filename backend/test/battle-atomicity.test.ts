import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import { commitBattleAndState, getOrCreateGameState, saveGameStateIfVersion } from '../src/utils/saveManager';
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
 * Regression coverage for the battle-write atomicity hole: D1 batch only rolls
 * back on errors, so a 0-row conditional state update used to leave the battle
 * statement committed (free boss abandon, lost rewards). The fixes put the
 * battle write first (guarded by the state version) and make the state write
 * conditional on the post-write battle row, so both match 1 or both match 0.
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
      runLoot: { currency: 50, items: [{ itemId: 'potion_small', quantity: 2 }] },
    },
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

function makeBattle(battleId: string): BattleState {
  return {
    id: battleId,
    roomId: 'room-1',
    playerFamiliar: makeCombatant('yellowFighter', 140, 60, true),
    enemyFamiliar: makeCombatant('tideTurtle', 9999, 70, false),
    isBoss: false,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
  };
}

async function seedBattle(battleId: string, anonId: string, battle: BattleState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battleId, anonId, JSON.stringify(battle))
    .run();
}

async function readBattle(battleId: string): Promise<BattleState | null> {
  const row = await (env as unknown as Bindings).DB.prepare(
    'SELECT battle_json FROM active_battles WHERE battle_id = ?'
  )
    .bind(battleId)
    .first<{ battle_json: string }>();
  return row ? (JSON.parse(row.battle_json) as BattleState) : null;
}

async function readStateRow(anonId: string): Promise<{ state: GameState; version: number }> {
  const row = await (env as unknown as Bindings).DB.prepare(
    'SELECT state_json, version FROM game_states WHERE anonymous_id = ?'
  )
    .bind(anonId)
    .first<{ state_json: string; version: number }>();
  return { state: JSON.parse(row!.state_json) as GameState, version: row!.version };
}

describe('atomic battle + state commit', () => {
  it('commits both statements when the state version is current', async () => {
    const db = (env as unknown as Bindings).DB;
    const anonId = crypto.randomUUID();
    const battleId = crypto.randomUUID();
    const loaded = await getOrCreateGameState(db, anonId, true);
    const battle = makeBattle(battleId);
    await seedBattle(battleId, anonId, battle);

    battle.turnCount = 1;
    const newJson = JSON.stringify(battle);
    const committed = await commitBattleAndState(db, {
      anonymousId: anonId,
      expectedVersion: loaded.version,
      state: loaded.state,
      battle: {
        sql: `UPDATE active_battles
                SET battle_json = ?, updated_at = datetime('now')
                WHERE battle_id = ? AND anonymous_id = ?
                  AND json_extract(battle_json, '$.turnCount') = ?`,
        params: [newJson, battleId, anonId, 0],
      },
      postBattle: {
        sql: 'EXISTS (SELECT 1 FROM active_battles WHERE battle_id = ? AND anonymous_id = ? AND battle_json = ?)',
        params: [battleId, anonId, newJson],
      },
    });

    expect(committed).toBe(true);
    expect((await readBattle(battleId))?.turnCount).toBe(1);
    expect((await readStateRow(anonId)).version).toBe(loaded.version + 1);
  });

  it('refuses BOTH writes when the state version moved between read and write', async () => {
    const db = (env as unknown as Bindings).DB;
    const anonId = crypto.randomUUID();
    const battleId = crypto.randomUUID();
    const loaded = await getOrCreateGameState(db, anonId, true);
    const battle = makeBattle(battleId);
    await seedBattle(battleId, anonId, battle);

    // Another writer lands after the route read `loaded.version`.
    expect(await saveGameStateIfVersion(db, anonId, loaded.state, loaded.version)).toBe(true);

    // The pending action was computed from the old battle row; it must not save
    // its state (rewards/cap) nor advance the battle.
    battle.turnCount = 1;
    const newJson = JSON.stringify(battle);
    loaded.state.winCount = 99;
    loaded.state.battleCount = 99;
    const committed = await commitBattleAndState(db, {
      anonymousId: anonId,
      expectedVersion: 1,
      state: loaded.state,
      battle: {
        sql: `UPDATE active_battles
                SET battle_json = ?, updated_at = datetime('now')
                WHERE battle_id = ? AND anonymous_id = ?
                  AND json_extract(battle_json, '$.turnCount') = ?`,
        params: [newJson, battleId, anonId, 0],
      },
      postBattle: {
        sql: 'EXISTS (SELECT 1 FROM active_battles WHERE battle_id = ? AND anonymous_id = ? AND battle_json = ?)',
        params: [battleId, anonId, newJson],
      },
    });

    expect(committed).toBe(false);
    // Battle untouched...
    expect((await readBattle(battleId))?.turnCount).toBe(0);
    // ...and the stale state write did not land.
    const after = await readStateRow(anonId);
    expect(after.version).toBe(2);
    expect(after.state.winCount).toBe(0);
    expect(after.state.battleCount).toBe(0);
  });

  it('a boss abandon racing an interleaved swap cannot delete the battle without forfeiting', async () => {
    const db = (env as unknown as Bindings).DB;
    const anonId = crypto.randomUUID();
    const battleId = crypto.randomUUID();
    await getOrCreateGameState(db, anonId, true);
    // Install the seeded state so the run-loot forfeit is observable.
    const state = makeState(anonId);
    await db
      .prepare('UPDATE game_states SET state_json = ?, version = version + 1 WHERE anonymous_id = ?')
      .bind(JSON.stringify(state), anonId)
      .run();
    const battle = makeBattle(battleId);
    battle.isBoss = true;
    await seedBattle(battleId, anonId, battle);

    // The abandon request reads version 2 / turnCount 0, then a swap wins the
    // race (swap does NOT change turnCount, so turnCount alone cannot guard it).
    const current = await readStateRow(anonId);
    const swapped = JSON.parse(JSON.stringify(battle)) as BattleState;
    swapped.playerFamiliar = makeCombatant('whiteDog', 120, 80, true);
    swapped.swapsThisTurn = 1;
    const swappedJson = JSON.stringify(swapped);
    const swapCommitted = await commitBattleAndState(db, {
      anonymousId: anonId,
      expectedVersion: current.version,
      state: current.state,
      battle: {
        sql: `UPDATE active_battles
                SET battle_json = ?, updated_at = datetime('now')
                WHERE battle_id = ? AND anonymous_id = ?
                  AND COALESCE(json_extract(battle_json, '$.swapsThisTurn'), 0) = ?
                  AND json_extract(battle_json, '$.playerFamiliar.familiarData.id') = ?`,
        params: [swappedJson, battleId, anonId, 0, 'yellowFighter'],
      },
      postBattle: {
        sql: 'EXISTS (SELECT 1 FROM active_battles WHERE battle_id = ? AND anonymous_id = ? AND battle_json = ?)',
        params: [battleId, anonId, swappedJson],
      },
    });
    expect(swapCommitted).toBe(true);

    // The abandon's stale delete + forfeit must both no-op.
    const forfeitState = { ...current.state, dungeon: null };
    const abandonCommitted = await commitBattleAndState(db, {
      anonymousId: anonId,
      expectedVersion: current.version,
      state: forfeitState,
      battle: {
        sql: `DELETE FROM active_battles
                WHERE battle_id = ? AND anonymous_id = ?
                  AND json_extract(battle_json, '$.turnCount') = ?`,
        params: [battleId, anonId, 0],
      },
      postBattle: {
        sql: 'NOT EXISTS (SELECT 1 FROM active_battles WHERE battle_id = ? AND anonymous_id = ?)',
        params: [battleId, anonId],
      },
    });

    expect(abandonCommitted).toBe(false);
    // Battle still live with the swapped familiar...
    const persisted = await readBattle(battleId);
    expect(persisted).not.toBeNull();
    expect(persisted!.playerFamiliar.familiarData.id).toBe('whiteDog');
    expect(persisted!.swapsThisTurn).toBe(1);
    // ...and the run was not forfeited behind the player's back.
    const after = await readStateRow(anonId);
    expect(after.state.dungeon).not.toBeNull();
    expect(after.state.dungeon!.runLoot?.currency).toBe(50);
    expect(after.version).toBe(current.version + 1);
  });

  it('exactly one of a simultaneous action and swap commits', async () => {
    const db = (env as unknown as Bindings).DB;
    const anonId = crypto.randomUUID();
    const battleId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
           VALUES (?, ?, 1, datetime('now'), 1)`
      )
      .bind(anonId, JSON.stringify(makeState(anonId)))
      .run();
    await seedBattle(battleId, anonId, makeBattle(battleId));

    const [action, swap] = await Promise.all([
      fetchApp(
        post('/api/game/battle/action', {
          anonymousId: anonId,
          battleId,
          action: { type: ActionType.Attack },
          expectedTurnCount: 0,
        })
      ),
      fetchApp(
        post('/api/game/battle/swap', {
          anonymousId: anonId,
          battleId,
          newFamiliarId: 'whiteDog',
          expectedTurnCount: 0,
        })
      ),
    ]);

    expect([action.status, swap.status].sort()).toEqual([200, 409]);

    const persisted = await readBattle(battleId);
    expect(persisted).not.toBeNull();
    if (swap.status === 200) {
      // The swap landed; the action must not have advanced the turn.
      expect(persisted!.playerFamiliar.familiarData.id).toBe('whiteDog');
      expect(persisted!.swapsThisTurn).toBe(1);
      expect(persisted!.turnCount).toBe(0);
    } else {
      // The action landed; the swap must not have replaced the familiar.
      expect(persisted!.playerFamiliar.familiarData.id).toBe('yellowFighter');
      expect(persisted!.turnCount).toBe(1);
    }

    // Only the winning request wrote the state.
    expect((await readStateRow(anonId)).version).toBe(2);
  });
});
