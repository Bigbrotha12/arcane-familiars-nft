import { type BattleAction, type BattleFamiliar, type ActionResult, type StatusEffect, ActionType, Outcome } from '@/types/battle';
import { AbilityData, ScalingStat, StatName, EffectType, Target } from '@/data/abilities';
import { getAbility } from '@/data/abilities';
import { getItem, ItemEffect, ItemType } from '@/data/items';

export function getEffectiveStat(baseStat: number, effects: StatusEffect[], statName: StatName): number {
  let multiplier = 1;
  for (const effect of effects) {
    if (effect.stat === statName && (effect.type === EffectType.Buff || effect.type === EffectType.Debuff)) {
      multiplier *= effect.value;
    }
  }
  return Math.max(1, Math.round(baseStat * multiplier));
}

function toStatName(scalingStat: ScalingStat): StatName {
  if (scalingStat === ScalingStat.Attack) return StatName.Attack;
  return StatName.Arcane;
}

export function calculateDamage(
  attacker: BattleFamiliar,
  defender: BattleFamiliar,
  abilityMultiplier: number,
  scalingStat: ScalingStat,
  rng: () => number,
): { damage: number; isCritical: boolean } {
  const offensiveStat = scalingStat === ScalingStat.Arcane ? attacker.familiarData.stats.arcane : attacker.familiarData.stats.attack;
  const attackerStat = getEffectiveStat(offensiveStat, attacker.statusEffects, toStatName(scalingStat));
  const defenderStat = getEffectiveStat(defender.familiarData.stats.defense, defender.statusEffects, StatName.Defense);

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
 * Effects in `skip` keep their current duration (e.g. effects applied by the
 * second actor this turn, which must survive until the end of the next turn).
 */
export function applyStatusEffects(familiar: BattleFamiliar, skip?: Set<StatusEffect>): BattleFamiliar {
  const updated = { ...familiar, statusEffects: [...familiar.statusEffects] };
  let hpChange = 0;

  for (const effect of updated.statusEffects) {
    if (effect.type === EffectType.Hot) {
      hpChange += effect.value;
    } else if (effect.type === EffectType.Dot) {
      hpChange -= effect.value;
    }
  }

  updated.currentHp = Math.min(
    familiar.familiarData.stats.maxHp,
    Math.max(0, familiar.currentHp + hpChange),
  );

  updated.statusEffects = updated.statusEffects
    .map((e) => (skip?.has(e) ? e : { ...e, turnsRemaining: e.turnsRemaining - 1 }))
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
): {
  playerResult: ActionResult;
  enemyResult: ActionResult;
  updatedPlayerFamiliar: BattleFamiliar;
  updatedEnemyFamiliar: BattleFamiliar;
} {
  // Execute player action with original familiars
  const playerResult = executeAction(playerAction, playerFamiliar, enemyFamiliar, rng);

  // Apply player action result
  let updatedPlayer = applyActionResult(playerFamiliar, playerResult);
  let updatedEnemy = applyActionResult(enemyFamiliar, playerResult);

  // Deduct MP for player ability use
  if (playerAction.type === ActionType.Ability && playerAction.abilityId) {
    const ability = getAbility(playerAction.abilityId);
    if (ability && playerFamiliar.currentMp >= ability.mpCost) {
      updatedPlayer = { ...updatedPlayer, currentMp: updatedPlayer.currentMp - ability.mpCost };
    }
  }

  // Execute enemy action with updated familiars (so defend buff affects damage calc)
  const enemyResult = executeAction(enemyAction, updatedEnemy, updatedPlayer, rng);

  // Apply enemy action result
  updatedPlayer = applyActionResult(updatedPlayer, enemyResult);
  updatedEnemy = applyActionResult(updatedEnemy, enemyResult);

  // Deduct MP for enemy ability use
  if (enemyAction.type === ActionType.Ability && enemyAction.abilityId) {
    const ability = getAbility(enemyAction.abilityId);
    if (ability && updatedEnemy.currentMp >= ability.mpCost) {
      updatedEnemy = { ...updatedEnemy, currentMp: updatedEnemy.currentMp - ability.mpCost };
    }
  }

  // Tick status effects. Effects applied by the enemy (the second actor) must
  // not be decremented this turn — they have not protected against anything yet.
  const freshEnemyEffects = new Set<StatusEffect>(enemyResult.appliedEffects ?? []);
  updatedPlayer = applyStatusEffects(updatedPlayer);
  updatedEnemy = applyStatusEffects(updatedEnemy, freshEnemyEffects);

  // Mutual KO: both combatants fall on the same turn. The player is awarded
  // the victory (checkBattleOutcome checks the enemy first) but survives with
  // 1 HP so they can keep exploring. A win must never leave the player at 0 HP;
  // 0 HP always means a loss / end of exploration.
  if (updatedPlayer.currentHp <= 0 && updatedEnemy.currentHp <= 0) {
    updatedPlayer = { ...updatedPlayer, currentHp: 1 };
  }

  return { playerResult, enemyResult, updatedPlayerFamiliar: updatedPlayer, updatedEnemyFamiliar: updatedEnemy };
}

function applyActionResult(
  familiar: BattleFamiliar,
  result: ActionResult,
): BattleFamiliar {
  if (result.targetId !== familiar.uid) return familiar;

  let updated = { ...familiar, statusEffects: [...familiar.statusEffects] };

  // Apply damage/healing
  if (result.effectType === EffectType.Damage || result.effectType === EffectType.Dot) {
    updated.currentHp = Math.max(0, updated.currentHp - result.value);
  } else if (result.effectType === EffectType.Heal || result.effectType === EffectType.Hot) {
    updated.currentHp = Math.min(updated.familiarData.stats.maxHp, updated.currentHp + result.value);
  } else if (result.effectType === EffectType.MpHeal) {
    updated.currentMp = Math.min(updated.familiarData.stats.maxMp, updated.currentMp + result.value);
  }

  // Apply status effects. Re-applying an effect from the same ability
  // refreshes it instead of stacking multiplicatively.
  if (result.appliedEffects) {
    for (const effect of result.appliedEffects) {
      const existingIdx = updated.statusEffects.findIndex((e) => e.abilityId === effect.abilityId);
      if (existingIdx >= 0) {
        updated.statusEffects[existingIdx] = effect;
      } else {
        updated.statusEffects.push(effect);
      }
    }
  }

  return updated;
}

function executeAction(
  action: BattleAction,
  source: BattleFamiliar,
  target: BattleFamiliar,
  rng: () => number,
): ActionResult {
  let actualTarget: BattleFamiliar;

  if (action.type === ActionType.Item) {
    actualTarget = source;
  } else if (action.type === ActionType.Ability && action.abilityId) {
    const ability = getAbility(action.abilityId);
    if (ability) {
      actualTarget = (ability.target === Target.Self || ability.target === Target.Ally) ? source : target;
    } else {
      actualTarget = action.targetId === source.uid ? source : target;
    }
  } else {
    actualTarget = action.targetId === source.uid ? source : target;
  }

  if (action.type === ActionType.Attack) {
    const { damage, isCritical } = calculateDamage(source, actualTarget, 1.0, ScalingStat.Attack, rng);
    return {
      effectType: EffectType.Damage,
      targetId: actualTarget.uid,
      value: damage,
      isCritical,
      description: `${source.familiarData.name} attacks for ${damage} damage${isCritical ? ' (Critical!)' : ''}`,
    };
  }

  if (action.type === ActionType.Ability && action.abilityId) {
    const ability = getAbility(action.abilityId);
    if (!ability) {
      return {
        effectType: EffectType.Damage,
        targetId: actualTarget.uid,
        value: 0,
        isCritical: false,
        description: 'Unknown ability used',
      };
    }
    if (source.currentMp < ability.mpCost) {
      return {
        effectType: EffectType.Damage,
        targetId: actualTarget.uid,
        value: 0,
        isCritical: false,
        description: `${source.familiarData.name} does not have enough MP to use ${ability.name}`,
      };
    }
    return executeAbility(ability, source, actualTarget, rng);
  }

  if (action.type === ActionType.Defend) {
    return {
      effectType: EffectType.Buff,
      targetId: source.uid,
      value: 1.5,
      isCritical: false,
      description: `${source.familiarData.name} defends`,
      appliedEffects: [createDefendEffect()],
    };
  }

  if (action.type === ActionType.Run) {
    return {
      effectType: EffectType.Damage,
      targetId: source.uid,
      value: 0,
      isCritical: false,
      description: `${source.familiarData.name} attempts to flee`,
    };
  }

  if (action.type === ActionType.Item && action.itemId) {
    const item = getItem(action.itemId);
    if (!item || item.type !== ItemType.Consumable) {
      return {
        effectType: EffectType.Damage,
        targetId: source.uid,
        value: 0,
        isCritical: false,
        description: `Unknown or non-consumable item: ${action.itemId}`,
      };
    }

    if (item.effect.type === ItemEffect.HP_HEAL) {
      const healed = Math.min(actualTarget.familiarData.stats.maxHp - actualTarget.currentHp, item.effect.value);
      return {
        effectType: EffectType.Heal,
        targetId: actualTarget.uid,
        value: Math.max(0, healed),
        isCritical: false,
        description: `${source.familiarData.name} uses ${item.name} to restore ${Math.max(0, healed)} HP`,
      };
    }

    if (item.effect.type === ItemEffect.MP_HEAL) {
      const restored = Math.min(actualTarget.familiarData.stats.maxMp - actualTarget.currentMp, item.effect.value);
      return {
        effectType: EffectType.MpHeal,
        targetId: actualTarget.uid,
        value: Math.max(0, restored),
        isCritical: false,
        description: `${source.familiarData.name} uses ${item.name} to restore ${Math.max(0, restored)} MP`,
      };
    }

    return {
      effectType: EffectType.Damage,
      targetId: actualTarget.uid,
      value: 0,
      isCritical: false,
      description: `${source.familiarData.name} uses ${item.name}`,
    };
  }

  return {
    effectType: EffectType.Damage,
    targetId: actualTarget.uid,
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
  if (ability.effectType === EffectType.Damage) {
    const { damage, isCritical } = calculateDamage(source, target, ability.multiplier, ability.scalingStat, rng);

    const statusEffects = ability.statusEffect
      ? [{
        abilityId: ability.id,
        type: ability.statusEffect.type,
        stat: ability.statusEffect.stat,
        value: ability.statusEffect.value,
        turnsRemaining: ability.statusEffect.duration,
      }]
      : undefined;

    return {
      effectType: ability.effectType,
      targetId: target.uid,
      value: damage,
      isCritical,
      description: `${source.familiarData.name} uses ${ability.name} for ${damage} damage${isCritical ? ' (Critical!)' : ''}`,
      appliedEffects: statusEffects,
    };
  }

  if (ability.effectType === EffectType.Heal) {
    const healAmount = Math.round(target.familiarData.stats.maxHp * ability.multiplier);

    const statusEffects = ability.statusEffect
      ? [{
        abilityId: ability.id,
        type: ability.statusEffect.type,
        stat: ability.statusEffect.stat,
        value: ability.statusEffect.value,
        turnsRemaining: ability.statusEffect.duration,
      }]
      : undefined;

    return {
      effectType: EffectType.Heal,
      targetId: target.uid,
      value: healAmount,
      isCritical: false,
      description: `${source.familiarData.name} uses ${ability.name} to restore ${healAmount} HP`,
      appliedEffects: statusEffects,
    };
  }

  if (ability.effectType === EffectType.Buff) {
    const statusEffects = ability.statusEffect
      ? [{
        abilityId: ability.id,
        type: ability.statusEffect.type,
        stat: ability.statusEffect.stat,
        value: ability.statusEffect.value,
        turnsRemaining: ability.statusEffect.duration,
      }]
      : undefined;

    return {
      effectType: EffectType.Buff,
      targetId: source.uid,
      value: ability.multiplier,
      isCritical: false,
      description: `${source.familiarData.name} uses ${ability.name}`,
      appliedEffects: statusEffects,
    };
  }

  return {
    effectType: ability.effectType,
    targetId: target.uid,
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
): Outcome {
  if (enemyFamiliar.currentHp <= 0) return Outcome.Win;
  if (playerFamiliar.currentHp <= 0) return Outcome.Loss;
  return Outcome.Continue;
}

function createDefendEffect(): StatusEffect {
  return {
    abilityId: 'defend',
    type: EffectType.Buff,
    stat: StatName.Defense,
    value: 1.5,
    turnsRemaining: 1,
  };
}

/**
 * Apply defend action: temporary 1.5x defense for the current round.
 */
export function applyDefend(familiar: BattleFamiliar): BattleFamiliar {
  return {
    ...familiar,
    statusEffects: [...familiar.statusEffects, createDefendEffect()],
  };
}

/**
 * Tick down all cooldowns by one, then set the cooldown for the ability used
 * this turn (so a cooldown of N makes the ability unusable for N turns).
 */
export function updateCooldowns(familiar: BattleFamiliar, action: BattleAction): BattleFamiliar {
  const cooldowns: Record<string, number> = {};
  for (const key of Object.keys(familiar.cooldowns)) {
    cooldowns[key] = Math.max(0, familiar.cooldowns[key] - 1);
  }
  if (action.type === ActionType.Ability && action.abilityId) {
    const ability = getAbility(action.abilityId);
    if (ability) {
      cooldowns[action.abilityId] = ability.cooldown;
    }
  }
  return { ...familiar, cooldowns };
}
