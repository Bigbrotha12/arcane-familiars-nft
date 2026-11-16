import type { FamiliarData } from '@/data/familiars';
import { BALANCE } from '@/data/balance';
import { SIGNATURE_BY_AFFINITY } from '@/data/abilities';
import { MAX_FAMILIAR_LEVEL } from '@/utils/progression';

export interface LearnEntry {
  level: number;
  abilityId: string;
}

/** Rank-II id for a base ability (generated in `data/abilities`). */
export function rankIIId(abilityId: string): string {
  return `${abilityId}_2`;
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_FAMILIAR_LEVEL, Math.floor(level)));
}

/**
 * Ability ids a familiar of `species` can use at `level`.
 *
 * Base slots unlock at Lv 1 / 3 / 6 (any extra entries also at 6), the
 * affinity signature at Lv 9, and at Lv 12 every learned ability is replaced by
 * its rank-II variant. Bosses always have their full base kit (no gating, no
 * signature), but rank up at the same level as everyone else so late bosses
 * keep pace with ranked-up parties.
 */
export function abilitiesAtLevel(species: FamiliarData, level: number): string[] {
  const lvl = clampLevel(level);
  const { second, third, signature, rankUp } = BALANCE.learnLevels;
  if (species.isBoss) return lvl >= rankUp ? species.abilities.map(rankIIId) : [...species.abilities];

  const learned: string[] = [];

  species.abilities.forEach((abilityId, index) => {
    const unlockLevel = index === 0 ? 1 : index === 1 ? second : third;
    if (lvl >= unlockLevel && !learned.includes(abilityId)) learned.push(abilityId);
  });

  const signatureAbility = SIGNATURE_BY_AFFINITY[species.affinity];
  if (lvl >= signature && signatureAbility && !learned.includes(signatureAbility)) {
    learned.push(signatureAbility);
  }

  return lvl >= rankUp ? learned.map(rankIIId) : learned;
}

/**
 * Every unlock in level order, including one rank-up entry per learned ability
 * at the rank-up level. Used by the UI to preview what comes next.
 */
export function learnSchedule(species: FamiliarData): LearnEntry[] {
  if (species.isBoss) return species.abilities.map((abilityId) => ({ level: 1, abilityId }));

  const { second, third, signature, rankUp } = BALANCE.learnLevels;
  const schedule: LearnEntry[] = [];
  const seen = new Set<string>();

  for (const [index, abilityId] of species.abilities.entries()) {
    if (seen.has(abilityId)) continue;
    seen.add(abilityId);
    schedule.push({ level: index === 0 ? 1 : index === 1 ? second : third, abilityId });
  }

  const signatureAbility = SIGNATURE_BY_AFFINITY[species.affinity];
  if (signatureAbility && !seen.has(signatureAbility)) {
    seen.add(signatureAbility);
    schedule.push({ level: signature, abilityId: signatureAbility });
  }

  for (const entry of [...schedule]) {
    schedule.push({ level: rankUp, abilityId: rankIIId(entry.abilityId) });
  }

  return schedule;
}

/** Ids present at `toLevel` but not at `fromLevel`, in their learned order. */
export function newlyLearned(species: FamiliarData, fromLevel: number, toLevel: number): string[] {
  const known = new Set(abilitiesAtLevel(species, fromLevel));
  return abilitiesAtLevel(species, toLevel).filter((abilityId) => !known.has(abilityId));
}
