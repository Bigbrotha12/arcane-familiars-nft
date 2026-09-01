import type { GameState } from '@arcane-familiars/game-logic';
import { generateId } from './uuid';

export interface LoadedState {
  state: GameState;
  version: number;
  isAnonymous: boolean;
}

export function createDefaultGameState(anonymousId: string): GameState {
  const now = Date.now();
  return {
    version: 1,
    id: generateId(),
    anonymousId,
    playerFamiliars: ['whiteDog', 'yellowFighter', 'aquaSprite'],
    activeParty: [],
    inventory: {
      currency: 100,
      items: [{ itemId: 'potion_small', quantity: 3 }],
    },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: now,
  };
}

export async function loadGameState(db: D1Database, anonymousId: string): Promise<LoadedState | null> {
  const row = await db
    .prepare('SELECT state_json, version, is_anonymous FROM game_states WHERE anonymous_id = ?')
    .bind(anonymousId)
    .first<{ state_json: string; version: number; is_anonymous: number }>();

  if (!row) return null;
  return {
    state: JSON.parse(row.state_json) as GameState,
    version: row.version,
    isAnonymous: row.is_anonymous === 1,
  };
}

/**
 * Load an existing state or create (and persist) a default one. Uses an
 * idempotent INSERT so concurrent first loads cannot collide.
 *
 * Guest sessions (no Passport token) are persisted exactly like signed-in
 * users, but marked `is_anonymous = 1` so a future cleanup job can purge
 * stale guest rows.
 */
export async function getOrCreateGameState(
  db: D1Database,
  anonymousId: string,
  isGuest: boolean = false
): Promise<LoadedState> {
  const existing = await loadGameState(db, anonymousId);
  if (existing) return existing;

  const state = createDefaultGameState(anonymousId);
  await db
    .prepare(
      `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), ?)
       ON CONFLICT(anonymous_id) DO NOTHING`
    )
    .bind(anonymousId, JSON.stringify(state), isGuest ? 1 : 0)
    .run();

  const created = await loadGameState(db, anonymousId);
  if (!created) {
    throw new Error(`Failed to create game state for ${anonymousId}`);
  }
  return created;
}

/**
 * Optimistic conditional write: only applies when the row is still at
 * expectedVersion. Returns false when another writer modified the state
 * first (caller should respond 409).
 */
export async function saveGameStateIfVersion(
  db: D1Database,
  anonymousId: string,
  state: GameState,
  expectedVersion: number
): Promise<boolean> {
  state.lastSaved = Date.now();
  const stateJson = JSON.stringify(state);
  const result = await db
    .prepare(
      `UPDATE game_states
       SET state_json = ?, version = version + 1, updated_at = datetime('now')
       WHERE anonymous_id = ? AND version = ?`
    )
    .bind(stateJson, anonymousId, expectedVersion)
    .run();
  return result.meta.changes === 1;
}

/**
 * Conditional state write used by battle routes: the UPDATE matches only when
 * BOTH the state row is at `expectedVersion` AND the battle row still exists
 * with `battleTurnCount` (via its persisted turnCount). The battle write in
 * the same D1 batch is conditional on the same battle row, so both statements
 * match-or-both-no-op — a stale battle row can no longer commit a state write
 * (which would leak cap increments/rewards). Returns the prepared statement;
 * the caller batches it with the battle statement.
 */
export function conditionalStateUpdate(
  db: D1Database,
  state: GameState,
  anonymousId: string,
  expectedVersion: number,
  battleId: string,
  battleTurnCount: number
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE game_states
         SET state_json = ?, version = version + 1, updated_at = datetime('now')
         WHERE anonymous_id = ? AND version = ?
           AND (SELECT json_extract(battle_json, '$.turnCount') FROM active_battles
                WHERE battle_id = ? AND anonymous_id = ?) = ?`
    )
    .bind(JSON.stringify(state), anonymousId, expectedVersion, battleId, anonymousId, battleTurnCount);
}
