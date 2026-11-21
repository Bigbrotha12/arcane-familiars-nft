import type { GameState } from '@arcane-familiars/game-logic';

/**
 * Strip the RNG seed from a persisted `BattleState` or `DungeonState` before it
 * is sent to the client.
 *
 * The seed lives in the persisted JSON on purpose: battle turns derive their
 * per-turn RNG from it and exploration replays the room outcome from it. It is
 * only ever exposed over the wire by accident, where it would let a client
 * predict every roll (and restart until it likes the seed). These helpers are
 * response-time only and never mutate the object that was/will be persisted.
 */
export function withoutSeed<T extends object>(value: T): Omit<T, 'seed'> {
  const { seed: _seed, ...rest } = value as T & { seed?: number };
  return rest;
}

export function sanitizeBattleForClient<T extends object>(battle: T): Omit<T, 'seed'> {
  return withoutSeed(battle);
}

export function sanitizeDungeonForClient<T extends object>(dungeon: T): Omit<T, 'seed'> {
  return withoutSeed(dungeon);
}

/**
 * Client-safe copy of a game state: identical except `dungeon.seed` is removed.
 * The dungeon is copied so the caller's (possibly already-persisted) state is
 * untouched.
 */
export function sanitizeStateForClient<T extends GameState>(state: T): T {
  if (!state.dungeon) return state;
  return { ...state, dungeon: withoutSeed(state.dungeon) } as T;
}
