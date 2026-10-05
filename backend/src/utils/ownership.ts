import type { GameState } from '@arcane-familiars/game-logic';

/**
 * Strict flag parse for the on-chain ownership authority rollout. Anything
 * other than the exact string `'true'` (including unset) leaves the feature
 * off, matching today's behaviour.
 */
export function isOwnershipAuthorityEnabled(env: { OWNERSHIP_AUTHORITY?: string }): boolean {
  return env.OWNERSHIP_AUTHORITY === 'true';
}

/**
 * Read the de-duplicated species the account owns on-chain from the
 * `owned_nfts` cache. Keyed by the verified Passport `sub`; an empty key
 * (guest) has no on-chain ownership.
 */
export async function getOwnedSpecies(db: D1Database, sub: string): Promise<string[]> {
  if (!sub) return [];

  const { results } = await db
    .prepare('SELECT DISTINCT species FROM owned_nfts WHERE sub = ?')
    .bind(sub)
    .all<{ species: string }>();

  return results.map((row) => row.species);
}

/**
 * Resolve the set of familiars a player may field.
 *
 * - Flag OFF: exactly `state.playerFamiliars` (the persisted grants set), with
 *   no database read — today's behaviour, byte for byte.
 * - Flag ON: the de-duplicated union `state.playerFamiliars ∪ ownedSpecies`.
 *   `playerFamiliars` already carries starters and boss rewards, so it stays
 *   authoritative for grants while on-chain ownership widens the set.
 *
 * A missing/unknown `owned_nfts` table (older local DB) or any read failure
 * falls back to grants: ownership resolution must never break play.
 */
export async function resolveFieldableFamiliars(
  db: D1Database,
  sub: string | undefined,
  state: GameState,
  flagEnabled: boolean
): Promise<string[]> {
  if (!flagEnabled) return state.playerFamiliars;

  let owned: string[];
  try {
    owned = await getOwnedSpecies(db, sub ?? '');
  } catch (error: unknown) {
    console.error('ownership: failed to read owned_nfts; falling back to grants', error);
    return state.playerFamiliars;
  }

  return [...new Set([...state.playerFamiliars, ...owned])];
}
