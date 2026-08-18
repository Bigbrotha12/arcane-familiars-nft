import type { GameState } from '@arcane-familiars/game-logic';
import { generateId } from './uuid';

export interface LoadedState {
  state: GameState;
  version: number;
}

export function createDefaultGameState(anonymousId: string): GameState {
  const now = Date.now();
  return {
    version: 1,
    id: generateId(),
    anonymousId,
    playerFamiliars: ['yellowFighter', 'aquaSprite'],
    activeParty: [],
    inventory: {
      currency: 100,
      items: [
        { itemId: 'potion_small', quantity: 3 },
      ],
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
    .prepare('SELECT state_json, version FROM game_states WHERE anonymous_id = ?')
    .bind(anonymousId)
    .first<{ state_json: string; version: number }>();

  if (!row) return null;
  return { state: JSON.parse(row.state_json) as GameState, version: row.version };
}

/**
 * Load an existing state or create (and persist) a default one. Uses an
 * idempotent INSERT so concurrent first loads cannot collide.
 */
export async function getOrCreateGameState(db: D1Database, anonymousId: string): Promise<LoadedState> {
  const existing = await loadGameState(db, anonymousId);
  if (existing) return existing;

  const state = createDefaultGameState(anonymousId);
  await db
    .prepare(
      `INSERT INTO game_states (anonymous_id, state_json, version, updated_at)
       VALUES (?, ?, 1, datetime('now'))
       ON CONFLICT(anonymous_id) DO NOTHING`
    )
    .bind(anonymousId, JSON.stringify(state))
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
  expectedVersion: number,
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
