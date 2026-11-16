import { AREAS } from '@/data/areas';

/** FNV-1a 32-bit hash, returned unsigned. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface DailyExpedition {
  areaId: string;
  seed: number;
}

/**
 * The day's shared expedition: one stable seed and area per UTC date. The area
 * is always one the player has unlocked, chosen from their unlocked list sorted
 * in AREAS order so the result is reproducible across clients.
 */
export function dailyExpedition(dateUtc: string, unlockedAreas: string[]): DailyExpedition {
  const seed = fnv1a32(dateUtc);
  const unlocked = Object.keys(AREAS).filter((areaId) => unlockedAreas.includes(areaId));
  // A valid save always has at least Verdant Meadow; the fallback keeps the
  // helper total even for a malformed/empty list.
  const pool = unlocked.length > 0 ? unlocked : [Object.keys(AREAS)[0]];
  return { areaId: pool[seed % pool.length], seed };
}
