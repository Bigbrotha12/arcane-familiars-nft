import type { GameState } from '@arcane-familiars/game-logic';
import { generateId } from './uuid';
import { GuestAccountAccessError } from './errors';

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
    familiarLevels: {},
    familiarXp: {},
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
 * True when `anonymousId` belongs to a registered account. Guests must never be
 * allowed to access these rows: readBody binds authenticated bodies to the
 * verified account key, but a guest controls `anonymousId` freely and could
 * otherwise present a user id to read/write that account's save (including
 * pre-creating a guest-marked row under an account id that has not saved yet).
 */
async function isAccountKey(db: D1Database, anonymousId: string): Promise<boolean> {
  const user = await db.prepare('SELECT 1 AS one FROM users WHERE user_id = ? LIMIT 1').bind(anonymousId).first();
  return user !== null;
}

/**
 * Load an existing state or create (and persist) a default one. Uses an
 * idempotent INSERT so concurrent first loads cannot collide.
 *
 * Guest sessions (no session token) are persisted exactly like signed-in
 * users, but marked `is_anonymous = 1` so a future cleanup job can purge
 * stale guest rows. A guest may only ever touch guest-marked rows: trying to
 * use an account's id (or a non-guest save) throws GuestAccountAccessError,
 * which routes surface as 403. This is the single choke point every /api/game
 * route goes through, so no route can opt out by forgetting a local check.
 */
export async function getOrCreateGameState(
  db: D1Database,
  anonymousId: string,
  isGuest: boolean = false
): Promise<LoadedState> {
  if (isGuest && (await isAccountKey(db, anonymousId))) {
    throw new GuestAccountAccessError();
  }

  const existing = await loadGameState(db, anonymousId);
  if (existing) {
    if (isGuest && !existing.isAnonymous) {
      throw new GuestAccountAccessError();
    }
    return existing;
  }

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
  if (isGuest && !created.isAnonymous) {
    throw new GuestAccountAccessError();
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
 * True when the account currently has a row in active_battles. Exploration and
 * party mutations use this to refuse writes while a battle is in flight, since
 * a concurrent state write would bump the version and cause an in-flight battle
 * action's state write to no-op while its battle write still commits (a lost
 * win/loss and rewards).
 */
export async function hasActiveBattle(db: D1Database, anonymousId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS one FROM active_battles WHERE anonymous_id = ? LIMIT 1')
    .bind(anonymousId)
    .first();
  return row !== null;
}

/**
 * Version-guarded state write that additionally refuses to commit when ANY
 * active battle exists for the account. This is the write-time half of the
 * active-battle guard: the pre-check in the route can race a `battle/start`
 * (check passes, battle starts, then the write lands), so the UPDATE carries
 * `NOT EXISTS (active_battles)` to make the write match-or-abort atomically.
 * Returns false when another writer won or a battle is active (caller: 409).
 */
export async function saveGameStateIfVersionNoBattle(
  db: D1Database,
  anonymousId: string,
  state: GameState,
  expectedVersion: number
): Promise<boolean> {
  state.lastSaved = Date.now();
  const result = await db
    .prepare(
      `UPDATE game_states
         SET state_json = ?, version = version + 1, updated_at = datetime('now')
         WHERE anonymous_id = ? AND version = ?
           AND NOT EXISTS (SELECT 1 FROM active_battles WHERE anonymous_id = ?)`
    )
    .bind(JSON.stringify(state), anonymousId, expectedVersion, anonymousId)
    .run();
  return result.meta.changes === 1;
}

/** A SQL predicate plus its bind parameters. */
export interface SqlPredicate {
  sql: string;
  params: (string | number)[];
}

/**
 * Conditional state write used by battle routes. It matches only when the
 * state row is still at `expectedVersion` AND, when supplied, the post-write
 * battle predicate holds. In a battle batch the battle statement runs FIRST
 * (guarded by the same state version), so:
 *
 * - if the battle write matched, the version is still `expectedVersion` and the
 *   post-write predicate describes the row we just wrote → the state write
 *   matches too;
 * - if the battle write matched 0 rows (stale writer), the battle row is
 *   unchanged, so a predicate describing the intended new battle row cannot
 *   hold and the state write matches 0 rows as well.
 *
 * That makes the pair all-or-nothing despite D1 batch not rolling back 0-row
 * matches. Returns the prepared statement; the caller batches it after the
 * battle statement via `commitBattleAndState`.
 */
export function conditionalStateUpdate(
  db: D1Database,
  state: GameState,
  anonymousId: string,
  expectedVersion: number,
  postBattle?: SqlPredicate
): D1PreparedStatement {
  const postBattleGuard = postBattle ? ` AND (${postBattle.sql})` : '';
  return db
    .prepare(
      `UPDATE game_states
         SET state_json = ?, version = version + 1, updated_at = datetime('now')
         WHERE anonymous_id = ? AND version = ?${postBattleGuard}`
    )
    .bind(JSON.stringify(state), anonymousId, expectedVersion, ...(postBattle?.params ?? []));
}

export interface AtomicBattleWrite {
  anonymousId: string;
  expectedVersion: number;
  state: GameState;
  /** Full UPDATE/DELETE statement (with its own WHERE) plus bind parameters. */
  battle: SqlPredicate;
  /** Predicate that must hold AFTER the battle statement lands. */
  postBattle: SqlPredicate;
}

/**
 * Atomically commit a battle-row mutation together with its game-state write.
 *
 * The battle statement is first and additionally requires the game_states row
 * to still be at `expectedVersion`; the state statement is second and requires
 * both the same version and `postBattle` (which describes the battle row as it
 * must look after the battle statement). Both therefore match 1 row or both
 * match 0 rows, closing the hole where a 0-row state update still let the
 * battle write commit (free boss abandon / lost rewards).
 */
export async function commitBattleAndState(db: D1Database, write: AtomicBattleWrite): Promise<boolean> {
  const battleStmt = db
    .prepare(
      `${write.battle.sql}
         AND EXISTS (SELECT 1 FROM game_states WHERE anonymous_id = ? AND version = ?)`
    )
    .bind(...write.battle.params, write.anonymousId, write.expectedVersion);

  const stateStmt = conditionalStateUpdate(db, write.state, write.anonymousId, write.expectedVersion, write.postBattle);

  const results = await db.batch([battleStmt, stateStmt]);
  return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1;
}
