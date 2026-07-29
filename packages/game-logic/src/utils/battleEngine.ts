import type { BattleAction, BattleFamiliar, ActionResult, StatusEffect } from '../types/battle';
import type { AbilityData } from '../data/abilities';
import { getAbility } from '../data/abilities';

/**
 * Get the effective stat value after applying all active buff/debuff multipliers.
 */
export function getEffectiveStat(baseStat: number, effects: StatusEffect[], statName: string): number {
  let multiplier = 1;
  for (const effect of effects) {
    if (effect.stat === statName && (effect.type === 'buff' || effect.type === 'debuff')) {
      multiplier *= effect.value;
    }
  }
  return Math.max(1, Math.round(baseStat * multiplier));
}

/**
 * Calculate damage using the plan's formula:
 * base = attackerStat * abilityMultiplier - defenderStat / 2
 * 10% crit chance for 1.5x multiplier
 * Minimum 1 damage
 */
export function calculateDamage(
  attacker: BattleFamiliar,
  defender: BattleFamiliar,
  abilityMultiplier: number,
  isArcaneScaled: boolean,
  rng: () => number,
): { damage: number; isCritical: boolean } {
  const attackerStat = isArcaneScaled
    ? getEffectiveStat(attacker.familiarData.stats.arcane, attacker.statusEffects, 'arcane')
    : getEffectiveStat(attacker.familiarData.stats.attack, attacker.statusEffects, 'attack');

  const defenderStat = getEffectiveStat(defender.familiarData.stats.defense, defender.statusEffects, 'defense');

  let baseDamage = attackerStat * abilityMultiplier - defenderStat / 2;

  const isCritical = rng() < 0.1;
  if (isCritical) {
    baseDamage *= 1.5;
  }

  const damage = Math.max(1, Math.round(baseDamage));
  return { damage, isCritical };
}

/**
 * Tick status effects: apply HoT/DoT, decrement durations, remove expired.
 */
export function applyStatusEffects(familiar: BattleFamiliar): BattleFamiliar {
  const updated = { ...familiar, statusEffects: [...familiar.statusEffects] };
  let hpChange = 0;

  for (const effect of updated.statusEffects) {
    if (effect.type === 'hot') {
      hpChange += effect.value;
    } else if (effect.type === 'dot') {
      hpChange -= effect.value;
    }
  }

  updated.currentHp = Math.min(
    familiar.familiarData.stats.maxHp,
    Math.max(0, familiar.currentHp + hpChange),
  );

  updated.statusEffects = updated.statusEffects
    .map((e) => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
    .filter((e) => e.turnsRemaining > 0);

  return updated;
}

/**
 * Resolve a single battle turn. Both actions are resolved with the player acting first.
 */
export function resolveTurn(
  playerAction: BattleAction,
  playerFamiliar: BattleFamiliar,
  enemyFamiliar: BattleFamiliar,
  enemyAction: BattleAction,
  rng: () => number,
): { playerResult: ActionResult; enemyResult: ActionResult } {
  const playerResult = executeAction(playerAction, playerFamiliar, enemyFamiliar, rng);
  const enemyResult = executeAction(enemyAction, enemyFamiliar, playerFamiliar, rng);

  return { playerResult, enemyResult };
}

function executeAction(
  action: BattleAction,
  source: BattleFamiliar,
  target: BattleFamiliar,
  rng: () => number,
): ActionResult {
  if (action.type === 'attack') {
    const { damage, isCritical } = calculateDamage(source, target, 1.0, false, rng);
    return {
      effectType: 'damage',
      targetId: target.familiarData.id,
      value: damage,
      isCritical,
      description: `${source.familiarData.name} attacks for ${damage} damage${isCritical ? ' (Critical!)' : ''}`,
    };
  }

  if (action.type === 'ability' && action.abilityId) {
    const ability = getAbility(action.abilityId);
    if (!ability) {
      return {
        effectType: 'damage',
        targetId: target.familiarData.id,
        value: 0,
        isCritical: false,
        description: 'Unknown ability used',
      };
    }
    return executeAbility(ability, source, target, rng);
  }

  return {
    effectType: 'damage',
    targetId: target.familiarData.id,
    value: 0,
    isCritical: false,
    description: 'No action taken',
  };
}

function executeAbility(
  ability: AbilityData,
  source: BattleFamiliar,
  target: BattleFamiliar,
  rng: () => number,
): ActionResult {
  if (ability.effectType === 'damage' || ability.effectType === 'damage_debuff') {
    const isArcaneScaled = ability.id === 'fireball' || ability.id === 'shadowstrike';
    const { damage, isCritical } = calculateDamage(source, target, ability.multiplier, isArcaneScaled, rng);

    const statusEffects = ability.statusEffect
      ? [{
          abilityId: ability.id,
          type: ability.statusEffect.type as 'buff' | 'debuff' | 'dot' | 'hot',
          stat: ability.statusEffect.stat,
          value: ability.statusEffect.value,
          turnsRemaining: ability.statusEffect.duration,
        }]
      : [];

    return {
      effectType: ability.effectType,
      targetId: target.familiarData.id,
      value: damage,
      isCritical,
      description: `${source.familiarData.name} uses ${ability.name} for ${damage} damage${isCritical ? ' (Critical!)' : ''}`,
    };
  }

  if (ability.effectType === 'heal') {
    const healAmount = Math.round(target.familiarData.stats.maxHp * ability.multiplier);
    return {
      effectType: 'heal',
      targetId: target.familiarData.id,
      value: healAmount,
      isCritical: false,
      description: `${source.familiarData.name} uses ${ability.name} to restore ${healAmount} HP`,
    };
  }

  if (ability.effectType === 'buff') {
    return {
      effectType: 'buff',
      targetId: source.familiarData.id,
      value: ability.multiplier,
      isCritical: false,
      description: `${source.familiarData.name} uses ${ability.name}`,
    };
  }

  return {
    effectType: ability.effectType,
    targetId: target.familiarData.id,
    value: 0,
    isCritical: false,
    description: `${source.familiarData.name} uses ${ability.name}`,
  };
}

/**
 * Check the battle outcome based on current HP values.
 */
export function checkBattleOutcome(
  playerFamiliar: BattleFamiliar,
  enemyFamiliar: BattleFamiliar,
): 'win' | 'lose' | 'continue' {
  if (enemyFamiliar.currentHp <= 0) return 'win';
  if (playerFamiliar.currentHp <= 0) return 'lose';
  return 'continue';
}

/**
 * Apply defend action: temporary 1.5x defense for the current round.
 */
export function applyDefend(familiar: BattleFamiliar): BattleFamiliar {
  const defendEffect: StatusEffect = {
    abilityId: 'defend',
    type: 'buff',
    stat: 'defense',
    value: 1.5,
    turnsRemaining: 1,
  };

  return {
    ...familiar,
    statusEffects: [...familiar.statusEffects, defendEffect],
  };
}
