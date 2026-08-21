import type { GameState } from '@arcane-familiars/game-logic';

export interface LoadedGameState {
  state: GameState;
  revision: number;
}

export async function loadGameState(db: D1Database, anonymousId: string): Promise<LoadedGameState | null> {
  const row = await db
    .prepare('SELECT state_json, revision FROM game_states WHERE anonymous_id = ?')
    .bind(anonymousId)
    .first<{ state_json: string; revision: number }>();

  if (!row) return null;
  return { state: JSON.parse(row.state_json) as GameState, revision: row.revision };
}

/**
 * Save a game state using optimistic concurrency. The write only succeeds if
 * the row still has `expectedRevision`; the revision is incremented on success.
 * Returns false when another writer won (caller should reload and retry).
 */
export async function saveGameState(
  db: D1Database,
  anonymousId: string,
  state: GameState,
  expectedRevision: number,
): Promise<boolean> {
  state.lastSaved = Date.now();
  const stateJson = JSON.stringify(state);

  const result = await db
    .prepare(
      `UPDATE game_states
       SET state_json = ?, revision = revision + 1, updated_at = datetime('now')
       WHERE anonymous_id = ? AND revision = ?`
    )
    .bind(stateJson, anonymousId, expectedRevision)
    .run();

  if ((result.meta.changes ?? 0) > 0) return true;

  // No matching row — insert the first revision. Fails if a concurrent insert won.
  try {
    await db
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, revision, updated_at)
         VALUES (?, ?, 1, datetime('now'))`
      )
      .bind(anonymousId, stateJson)
      .run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Load, mutate, and save a game state with bounded retry on conflict.
 * The mutate callback may return false to cancel the save (no write occurs).
 */
export async function mutateGameState(
  db: D1Database,
  anonymousId: string,
  mutate: (state: GameState) => boolean | void,
  maxRetries = 3,
): Promise<LoadedGameState | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const loaded = await loadGameState(db, anonymousId);
    if (!loaded) return null;

    if (mutate(loaded.state) === false) return null;

    if (await saveGameState(db, anonymousId, loaded.state, loaded.revision)) {
      return loaded;
    }
  }
  throw new Error(`Failed to persist game state for ${anonymousId} after ${maxRetries} attempts`);
}
