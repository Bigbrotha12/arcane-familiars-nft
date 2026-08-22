/**
 * Mulberry32 seeded PRNG.
 * Returns a function that produces deterministic random numbers in [0, 1).
 */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a random integer in [min, max] inclusive.
 */
export function randomInRange(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Select an index from weighted entries using the provided RNG.
 * Returns the index of the selected entry.
 */
export function weightedRandom(rng: () => number, entries: { weight: number }[]): number {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * totalWeight;
  for (let i = 0; i < entries.length; i++) {
    roll -= entries[i].weight;
    if (roll <= 0) return i;
  }
  return entries.length - 1;
}
