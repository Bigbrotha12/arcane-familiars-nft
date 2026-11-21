import type { RunStats, RunSummary, RunSummaryLoot } from '@/types/exploration';
import { AREAS } from '@/data/areas';
import type { RunLootSummary } from '@/utils/runLoot';

export interface BuildRunSummaryInput {
  outcome: RunSummary['outcome'];
  areaId: string;
  /** Falls back to the area's data name, then the raw id. */
  areaName?: string;
  stats: RunStats;
  /** Loot banked by the run (exit or clear). */
  loot?: RunLootSummary | null;
  /** Loot discarded by the run (defeat). */
  lost?: RunLootSummary | null;
}

/** Flatten inventory items to one id per unit and count charms. */
export function summarizeRunLoot(loot?: RunLootSummary | null): RunSummaryLoot {
  const items = (loot?.items ?? []).flatMap((item) =>
    Array.from({ length: Math.max(0, item.quantity) }, () => item.itemId)
  );
  const charms = loot?.charms?.length ?? 0;
  return {
    currency: loot?.currency ?? 0,
    items,
    ...(charms > 0 ? { charms } : {}),
  };
}

/**
 * Build the end-of-run summary shown on the world map. Pure: it only reads the
 * supplied stats/loot, so every outcome can be unit-tested without D1.
 */
export function buildRunSummary(input: BuildRunSummaryInput): RunSummary {
  const { outcome, areaId, stats } = input;
  const summary: RunSummary = {
    outcome,
    areaId,
    areaName: input.areaName ?? AREAS[areaId]?.name ?? areaId,
    stats,
    loot: summarizeRunLoot(input.loot),
  };

  if (input.lost) {
    summary.lost = summarizeRunLoot(input.lost);
  }

  return summary;
}
