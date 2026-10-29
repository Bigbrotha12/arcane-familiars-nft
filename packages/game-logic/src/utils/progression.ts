import type { FamiliarStats } from '@/data/familiars';

export const MAX_FAMILIAR_LEVEL = 20;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  return 80 + (level - 1) * 40;
}

/** Stat multiplier at a familiar level. Level 1 is the base kit. */
export function familiarLevelMultiplier(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_FAMILIAR_LEVEL, Math.floor(level)));
  return 1 + 0.06 * (clamped - 1);
}

export function scaleFamiliarStats(base: FamiliarStats, level: number): FamiliarStats {
  const multiplier = familiarLevelMultiplier(level);
  const scale = (value: number) => Math.round(value * multiplier);
  return {
    hp: scale(base.hp),
    maxHp: scale(base.maxHp),
    mp: scale(base.mp),
    maxMp: scale(base.maxMp),
    attack: scale(base.attack),
    defense: scale(base.defense),
    arcane: scale(base.arcane),
    speed: scale(base.speed),
  };
}

export interface LevelProgress {
  level: number;
  xp: number;
  leveledUp: boolean;
  levelsGained: number;
}

/** Apply XP, rolling over as many level-ups as the award earns. */
export function applyFamiliarXp(level: number, xp: number, gained: number): LevelProgress {
  let nextLevel = Math.max(1, Math.floor(level));
  let nextXp = Math.max(0, Math.floor(xp)) + Math.max(0, Math.floor(gained));
  let levelsGained = 0;

  while (nextLevel < MAX_FAMILIAR_LEVEL && nextXp >= xpToNextLevel(nextLevel)) {
    nextXp -= xpToNextLevel(nextLevel);
    nextLevel += 1;
    levelsGained += 1;
  }

  if (nextLevel >= MAX_FAMILIAR_LEVEL) {
    nextLevel = MAX_FAMILIAR_LEVEL;
    nextXp = 0;
  }

  return { level: nextLevel, xp: nextXp, leveledUp: levelsGained > 0, levelsGained };
}
