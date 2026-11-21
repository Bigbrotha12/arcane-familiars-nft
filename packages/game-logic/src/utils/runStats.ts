import type { DungeonState, RunStats } from '@/types/exploration';

export function emptyRunStats(): RunStats {
  return {
    battlesWon: 0,
    elitesWon: 0,
    roomsExplored: 0,
    chestsOpened: 0,
    curiosUsed: 0,
    xpByFamiliar: {},
    levelsByFamiliar: {},
    recruits: [],
    bondGains: {},
    learned: [],
    passiveUnlocks: [],
  };
}

/**
 * Per-run event tallies. Older saves predate the field, so it is created
 * lazily — same pattern as `getRunLoot`.
 */
export function getRunStats(dungeon: DungeonState | null | undefined): RunStats {
  if (!dungeon) return emptyRunStats();
  if (!dungeon.runStats) dungeon.runStats = emptyRunStats();
  return dungeon.runStats;
}
