import {
  CHARM_BASES,
  CHARM_BASE_BY_ID,
  CHARM_SECOND_NAMES,
  CHARM_STAT_LABELS,
  CHARM_STATS,
  type CharmInstance,
  type CharmMod,
  type CharmRarity,
  type CharmRoll,
  type CharmStat,
} from '@/data/charms';
import type { GameState } from '@/types/gameState';
import { randomInRange } from '@/utils/mathUtils';

/** Coins granted when a charm is salvaged. */
export const CHARM_SALVAGE: Record<CharmRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 60,
};

/** Most charms a player may own, equipped ones included. */
export const MAX_CHARMS = 40;

const RARITY_ROLL: Record<CharmRarity, { min: number; max: number; mods: number }> = {
  common: { min: 4, max: 6, mods: 1 },
  uncommon: { min: 5, max: 8, mods: 2 },
  rare: { min: 6, max: 10, mods: 3 },
};

/** Roll a charm: a random base, then its rarity's mods with distinct stats. */
export function rollCharm(rarity: CharmRarity, rng: () => number): CharmRoll {
  const chosen = CHARM_BASES[randomInRange(rng, 0, CHARM_BASES.length - 1)];
  const config = RARITY_ROLL[rarity];

  const mods: CharmMod[] = [{ stat: chosen.primary, pct: randomInRange(rng, config.min, config.max) }];
  const remaining = CHARM_STATS.filter((stat) => stat !== chosen.primary);
  for (let i = 1; i < config.mods; i++) {
    const index = randomInRange(rng, 0, remaining.length - 1);
    const [stat] = remaining.splice(index, 1);
    mods.push({ stat, pct: randomInRange(rng, config.min, config.max) });
  }

  return { baseId: chosen.id, rarity, mods };
}

export function charmName(roll: Pick<CharmRoll, 'baseId' | 'mods'>): string {
  const base = CHARM_BASE_BY_ID[roll.baseId];
  const baseName = base?.name ?? roll.baseId;
  const second = roll.mods[1];
  return second ? `${baseName} of ${CHARM_SECOND_NAMES[second.stat]}` : baseName;
}

export function charmModsLabel(roll: Pick<CharmRoll, 'mods'>): string {
  return roll.mods.map((mod) => `+${mod.pct}% ${CHARM_STAT_LABELS[mod.stat]}`).join(' · ');
}

/**
 * Return a NEW stats object with attack/defense/arcane/speed scaled by the
 * charm's percentages. HP/MP and every other field pass through untouched.
 */
export function applyCharm<T extends { attack: number; defense: number; arcane: number; speed: number }>(
  stats: T,
  charm?: Pick<CharmRoll, 'mods'> | null
): T {
  const multiplier: Record<CharmStat, number> = {
    attack: 1,
    defense: 1,
    arcane: 1,
    speed: 1,
  };
  for (const mod of charm?.mods ?? []) {
    multiplier[mod.stat] += mod.pct / 100;
  }

  return {
    ...stats,
    attack: Math.round(stats.attack * multiplier.attack),
    defense: Math.round(stats.defense * multiplier.defense),
    arcane: Math.round(stats.arcane * multiplier.arcane),
    speed: Math.round(stats.speed * multiplier.speed),
  };
}

/** The charm currently worn by a familiar species, if any. */
export function equippedCharm(
  state: Pick<GameState, 'charms'> | null | undefined,
  familiarId: string
): CharmInstance | undefined {
  return (state?.charms ?? []).find((charm) => charm.equippedTo === familiarId);
}
