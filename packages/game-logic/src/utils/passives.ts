import { BALANCE } from '@/data/balance';
import { abilitiesAtLevel } from '@/utils/learnset';
import { getAbility } from '@/data/abilities';
import type { FamiliarData } from '@/data/familiars';
import { getFamiliar } from '@/data/familiars';
import { PASSIVES, type ActivePassive, type PassiveId } from '@/data/passives';

export type PassiveTier = 0 | 1 | 2 | 3 | 4;

/** Tier unlocked at `level`: 0 when locked, 1..4 at the configured levels. */
export function passiveTier(level: number): PassiveTier {
  let tier = 0;
  for (const unlock of BALANCE.passiveTierLevels) {
    if (level >= unlock) tier += 1;
  }
  return Math.min(4, tier) as PassiveTier;
}

/**
 * Passives in effect for a party. Both members apply, duplicates are resolved
 * by keeping the highest tier (no stacking), and locked passives are omitted.
 */
export function partyPassives(members: { familiarId: string; level: number }[]): ActivePassive[] {
  const best = new Map<PassiveId, ActivePassive>();

  for (const member of members) {
    const species = getFamiliar(member.familiarId);
    if (!species?.passive) continue;
    const tier = passiveTier(member.level);
    if (tier === 0) continue;

    const current = best.get(species.passive);
    if (!current || tier > current.tier) {
      best.set(species.passive, {
        id: species.passive,
        tier,
        value: PASSIVES[species.passive].tiers[tier - 1],
        sourceFamiliarId: member.familiarId,
      });
    }
  }

  return [...best.values()];
}

/** Passive tiers gained between two levels, for level-up announcements. */
export function newPassiveTiers(
  species: FamiliarData,
  fromLevel: number,
  toLevel: number
): { id: PassiveId; tier: 1 | 2 | 3 | 4 }[] {
  if (!species.passive) return [];
  const fromTier = passiveTier(fromLevel);
  const toTier = passiveTier(toLevel);
  if (toTier <= fromTier) return [];

  const gained: { id: PassiveId; tier: 1 | 2 | 3 | 4 }[] = [];
  for (let tier = fromTier + 1; tier <= toTier; tier++) {
    gained.push({ id: species.passive, tier: tier as 1 | 2 | 3 | 4 });
  }
  return gained;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;

/** Roman numeral for a passive tier (I..IV). */
export function passiveTierRoman(tier: 1 | 2 | 3 | 4): string {
  return ROMAN[tier];
}

function baseAbilityId(abilityId: string): string {
  return abilityId.endsWith('_2') ? abilityId.slice(0, -2) : abilityId;
}

/**
 * Human-readable party combos: each unlocked passive that boosts an ability the
 * partner can use at its level. Partner-only (a familiar never combos itself).
 */
export function passiveCombos(a: FamiliarData, aLevel: number, b: FamiliarData, bLevel: number): string[] {
  const combos: string[] = [];

  const addCombos = (owner: FamiliarData, ownerLevel: number, partner: FamiliarData, partnerLevel: number): void => {
    if (!owner.passive || passiveTier(ownerLevel) === 0) return;
    const passive = PASSIVES[owner.passive];
    const partnerAbilities = new Set(abilitiesAtLevel(partner, partnerLevel).map(baseAbilityId));

    for (const abilityId of passive.combosWith) {
      if (!partnerAbilities.has(abilityId)) continue;
      const abilityName = getAbility(abilityId)?.name ?? abilityId;
      const text = `${passive.name} boosts ${partner.name}'s ${abilityName}`;
      if (!combos.includes(text)) combos.push(text);
    }
  };

  addCombos(a, aLevel, b, bLevel);
  addCombos(b, bLevel, a, aLevel);

  return combos;
}
