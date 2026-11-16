import { Affinity, Rarity } from '@/data/familiars';

/**
 * Single home for combat tunables. Mechanics read from here; balance passes
 * edit only this file. Numbers are deliberately not typed as literals so the
 * data can be tuned without touching call sites.
 */
export const BALANCE = {
  /** damage = atk * mult * defenseScale / (defenseScale + def) */
  defenseScale: 100,
  critChance: 0.1,
  critMultiplier: 1.5,
  /** Uniform damage roll in [1 - damageVariance, 1 + damageVariance]. */
  damageVariance: 0.1,
  affinityStrong: 1.4,
  affinityWeak: 0.7,
  /** Defend: incoming direct damage multiplier for the whole turn. */
  guardDamageTaken: 0.5,
  /** Defend: fraction of max MP restored when the guarding slot executes. */
  guardMpRestore: 0.15,
  /** Basic Attack: fraction of the attacker's max MP restored when the hit lands. */
  attackMpRestore: 0.05,
  /**
   * Familiar level at which each slot of the learnset unlocks. `rankUp` upgrades
   * every already-learned ability to its rank-II variant.
   */
  learnLevels: { second: 3, third: 6, signature: 9, rankUp: 12 },
  /** Familiar levels at which party passives unlock / strengthen (tiers I..IV). */
  passiveTierLevels: [5, 10, 15, 20] as const,
  /** Per-turn chance an uncharged boss gathers power instead of acting. */
  bossChargeChance: 0.3,
  /** Damage multiplier of a charged boss's next damaging action. */
  bossChargeMultiplier: 2.0,
  /** Permanent direct-damage multiplier a boss gains when it enters phase two. */
  bossPhaseTwoAttack: 1.1,
  /** Per-turn charge chance for a boss in phase two. */
  bossPhaseTwoChargeChance: 0.35,
  /** Per-turn chance an uncharged volatile elite gathers power instead of acting. */
  eliteChargeChance: 0.2,
  /** Base chance a normal encounter rolls an elite affix. */
  eliteChance: 0.12,
  /** Added to the elite chance per unit of room depth (0..1). */
  eliteChancePerDepth: 0.12,
  /** Vampiric elites heal this fraction of the direct damage they deal. */
  eliteVampiricDrain: 0.3,
  /** XP multiplier for defeating an elite. Coins are doubled separately. */
  eliteXpMultiplier: 1.5,
  xpBase: 30,
  xpPerEnemyLevel: 10,
  bossXpMultiplier: 2.5,
  /** XP share for the party member who did not land the winning blow. */
  benchXpShare: 0.5,
  /**
   * Fraction of level-scaled max HP/MP restored by a rest shrine. The shrine is
   * the last room before a boss, so this is what the party takes into the fight.
   */
  restHealFraction: 0.6,
  // Bosses have several times a normal familiar's HP, so their %-of-max heals
  // are scaled down or they would undo whole turns of the player's work.
  bossHealScale: 0.4,
  // A recruit joins this many levels below the enemy it was recruited from
  // (never below 1), so a late-game recruit is usable instead of starting at 1.
  recruitLevelOffset: 1,
  /** Per-win chance to recruit a defeated unowned species. */
  recruitChanceCommon: 0.22,
  recruitChanceRare: 0.12,
  /**
   * Wins against an unowned species needed to guarantee a recruit. The bond
   * meter makes recruitment workable even when the per-win roll never lands.
   */
  recruitBondNeeded: {
    [Rarity.Common]: 3,
    [Rarity.Uncommon]: 3,
    [Rarity.Rare]: 4,
    [Rarity.Legendary]: 5,
  } satisfies Record<Rarity, number>,
};

export type AffinityEffectiveness = 'strong' | 'weak' | 'neutral';

/**
 * Offensive affinity chart. Each of Fire/Earth/Wind/Water beats the next
 * (Fire > Earth > Wind > Water > Fire); Light and Dark beat each other.
 * Any other pairing — including same affinity — is neutral.
 */
const STRONG_AGAINST: Record<Affinity, Affinity> = {
  [Affinity.Fire]: Affinity.Earth,
  [Affinity.Earth]: Affinity.Wind,
  [Affinity.Wind]: Affinity.Water,
  [Affinity.Water]: Affinity.Fire,
  [Affinity.Light]: Affinity.Dark,
  [Affinity.Dark]: Affinity.Light,
};

export function affinityEffectiveness(attacker: Affinity, defender: Affinity): AffinityEffectiveness {
  if (attacker === defender) return 'neutral';
  if (STRONG_AGAINST[attacker] === defender) return 'strong';
  if (STRONG_AGAINST[defender] === attacker) return 'weak';
  return 'neutral';
}

export function affinityMultiplier(attacker: Affinity, defender: Affinity): number {
  switch (affinityEffectiveness(attacker, defender)) {
    case 'strong':
      return BALANCE.affinityStrong;
    case 'weak':
      return BALANCE.affinityWeak;
    default:
      return 1;
  }
}

/** XP awarded for winning a battle against an enemy of `enemyLevel`. */
export function battleXp(enemyLevel: number, isBoss: boolean): number {
  return Math.round((BALANCE.xpBase + BALANCE.xpPerEnemyLevel * enemyLevel) * (isBoss ? BALANCE.bossXpMultiplier : 1));
}
