import {
  type BattleAction,
  type BattleFamiliar,
  type ActionResult,
  type StatusEffect,
  type TurnStep,
  type CanceledAction,
  ActionType,
  Outcome,
} from '@/types/battle';
import { AbilityData, ScalingStat, StatName, EffectType, Target } from '@/data/abilities';
import { getAbility } from '@/data/abilities';
import { getItem, ItemType, STAT_LABELS, type ItemData } from '@/data/items';

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
  rng: () => number
): { damage: number; isCritical: boolean } {
  const offensiveStat =
    scalingStat === ScalingStat.Arcane ? attacker.familiarData.stats.arcane : attacker.familiarData.stats.attack;
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
 * Effects in `skip` (those applied during the turn now ending, by EITHER
 * actor) get no HoT/DoT proc and no decrement — they keep their full duration
 * and must not take effect until the end of a turn they existed throughout.
 */
export function applyStatusEffects(familiar: BattleFamiliar, skip?: Set<StatusEffect>): BattleFamiliar {
  const updated = { ...familiar, statusEffects: [...familiar.statusEffects] };
  let hpChange = 0;

  for (const effect of updated.statusEffects) {
    if (skip?.has(effect)) continue;
    if (effect.type === EffectType.Hot) {
      hpChange += effect.value;
    } else if (effect.type === EffectType.Dot) {
      hpChange -= effect.value;
    }
  }

  updated.currentHp = Math.min(familiar.familiarData.stats.maxHp, Math.max(0, familiar.currentHp + hpChange));

  updated.statusEffects = updated.statusEffects
    .map((e) => (skip?.has(e) ? e : { ...e, turnsRemaining: e.turnsRemaining - 1 }))
    .filter((e) => e.turnsRemaining > 0);

  return updated;
}

/**
 * Resolve a single battle turn. Actors are ordered by effective Speed (higher
 * first; ties go to the player, with no RNG roll so seeded runs stay
 * deterministic). Each actor executes against the states left by the previous
 * actor. An actor whose HP has dropped to 0 before its slot is canceled: it
 * does not execute, spends no MP and applies no effects — its result slot is
 * filled with a zero-damage placeholder carrying the cancel reason.
 */
export function resolveTurn(
  playerAction: BattleAction,
  playerFamiliar: BattleFamiliar,
  enemyFamiliar: BattleFamiliar,
  enemyAction: BattleAction,
  rng: () => number
): {
  playerResult: ActionResult;
  enemyResult: ActionResult;
  updatedPlayerFamiliar: BattleFamiliar;
  updatedEnemyFamiliar: BattleFamiliar;
  steps: TurnStep[];
  canceledActions: CanceledAction[];
} {
  // Initiative is locked in before any action executes: speed effects applied
  // during this turn only influence the NEXT turn's ordering.
  const playerSpeed = getEffectiveStat(
    playerFamiliar.familiarData.stats.speed,
    playerFamiliar.statusEffects,
    StatName.Speed
  );
  const enemySpeed = getEffectiveStat(
    enemyFamiliar.familiarData.stats.speed,
    enemyFamiliar.statusEffects,
    StatName.Speed
  );

  const ordered: Array<{ who: 'player' | 'enemy'; action: BattleAction }> =
    playerSpeed >= enemySpeed
      ? [
          { who: 'player', action: playerAction },
          { who: 'enemy', action: enemyAction },
        ]
      : [
          { who: 'enemy', action: enemyAction },
          { who: 'player', action: playerAction },
        ];

  let playerCurrent = playerFamiliar;
  let enemyCurrent = enemyFamiliar;
  const steps: TurnStep[] = [];
  const canceledActions: CanceledAction[] = [];
  // Effects applied by ANY actor this turn must not proc or tick at end of turn.
  const freshEffects = new Set<StatusEffect>();

  let playerResult: ActionResult | undefined;
  let enemyResult: ActionResult | undefined;

  for (const { who, action } of ordered) {
    const isPlayer = who === 'player';
    const actorPre = isPlayer ? playerCurrent : enemyCurrent;
    const opponentPre = isPlayer ? enemyCurrent : playerCurrent;

    // KO-cancellation: an actor knocked out earlier in the turn never acts.
    if (actorPre.currentHp <= 0) {
      const reason = `${actorPre.familiarData.name} was knocked out before it could act!`;
      const placeholder: ActionResult = {
        effectType: EffectType.Damage,
        targetId: actorPre.uid,
        value: 0,
        isCritical: false,
        description: reason,
      };
      if (isPlayer) playerResult = placeholder;
      else enemyResult = placeholder;
      canceledActions.push({ uid: actorPre.uid, reason });
      continue;
    }

    const result = executeAction(action, actorPre, opponentPre, rng);
    let actorPost = applyActionResult(actorPre, result);
    const opponentPost = applyActionResult(opponentPre, result);

    // Deduct MP for ability use (same gate as before: known ability and the
    // actor had enough MP when it executed).
    if (action.type === ActionType.Ability && action.abilityId) {
      const ability = getAbility(action.abilityId);
      if (ability && actorPre.currentMp >= ability.mpCost) {
        actorPost = { ...actorPost, currentMp: actorPost.currentMp - ability.mpCost };
      }
    }

    if (result.appliedEffects) {
      for (const effect of result.appliedEffects) freshEffects.add(effect);
    }

    if (isPlayer) {
      playerResult = result;
      playerCurrent = actorPost;
      enemyCurrent = opponentPost;
    } else {
      enemyResult = result;
      enemyCurrent = actorPost;
      playerCurrent = opponentPost;
    }

    steps.push({
      actorUid: actorPre.uid,
      result,
      playerAfter: playerCurrent,
      enemyAfter: enemyCurrent,
    });
  }

  // Tick status effects. Effects applied during this turn (by either side)
  // neither proc nor decrement — they have not existed for a full turn yet.
  playerCurrent = applyStatusEffects(playerCurrent, freshEffects);
  enemyCurrent = applyStatusEffects(enemyCurrent, freshEffects);

  // Mutual KO: both combatants fall on the same turn. The player is awarded
  // the victory (checkBattleOutcome checks the enemy first) but survives with
  // 1 HP so they can keep exploring. A win must never leave the player at 0 HP;
  // 0 HP always means a loss / end of exploration.
  if (playerCurrent.currentHp <= 0 && enemyCurrent.currentHp <= 0) {
    playerCurrent = { ...playerCurrent, currentHp: 1 };
  }

  return {
    playerResult: playerResult!,
    enemyResult: enemyResult!,
    updatedPlayerFamiliar: playerCurrent,
    updatedEnemyFamiliar: enemyCurrent,
    steps,
    canceledActions,
  };
}

function applyActionResult(familiar: BattleFamiliar, result: ActionResult): BattleFamiliar {
  if (result.targetId !== familiar.uid) return familiar;

  const updated = { ...familiar, statusEffects: [...familiar.statusEffects] };

  // Apply damage/healing
  if (result.effectType === EffectType.Damage || result.effectType === EffectType.Dot) {
    updated.currentHp = Math.max(0, updated.currentHp - result.value);
  } else if (result.effectType === EffectType.Heal || result.effectType === EffectType.Hot) {
    updated.currentHp = Math.min(updated.familiarData.stats.maxHp, updated.currentHp + result.value);
  } else if (result.effectType === EffectType.MpHeal) {
    updated.currentMp = Math.min(updated.familiarData.stats.maxMp, updated.currentMp + result.value);
  }

  // Secondary MP component of multi-effect items (e.g. Elixir: Heal + MpHeal).
  if (result.mpValue) {
    updated.currentMp = Math.min(updated.familiarData.stats.maxMp, updated.currentMp + result.mpValue);
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

  // Cleanse runs AFTER applying new effects so a cleanse+buff item keeps its
  // own buff while stripping pre-existing Debuffs/Dots.
  if (result.cleanse) {
    updated.statusEffects = updated.statusEffects.filter(
      (e) => e.type !== EffectType.Dot && e.type !== EffectType.Debuff
    );
  }

  return updated;
}

/**
 * Merge an item's combat effects into a single ActionResult. State-level
 * effects (revive_party, grant_currency) are applied by the backend to the
 * save state and intentionally ignored here.
 *
 * Constraint: an item must not mix self-targeted and enemy-targeted effects —
 * the merged result carries a single targetId, so the enemy-targeted half
 * wins and the rest is dropped. No shipped item mixes targets.
 */
function applyItemEffects(item: ItemData, source: BattleFamiliar, enemy: BattleFamiliar): ActionResult {
  const descriptions: string[] = [];
  let damage = 0;
  let hpHeal = 0;
  let mpHeal = 0;
  let cleanse = false;
  let selfStatus: StatusEffect | undefined;
  let enemyStatus: StatusEffect | undefined;

  for (const effect of item.effects) {
    switch (effect.kind) {
      case 'heal_hp': {
        const healed = Math.max(0, Math.min(source.familiarData.stats.maxHp - source.currentHp, effect.value));
        hpHeal += healed;
        descriptions.push(`restores ${healed} HP`);
        break;
      }
      case 'heal_percentage': {
        const healed = Math.max(
          0,
          Math.min(
            source.familiarData.stats.maxHp - source.currentHp,
            Math.floor((source.familiarData.stats.maxHp * effect.percentage) / 100)
          )
        );
        hpHeal += healed;
        descriptions.push(`restores ${healed} HP`);
        break;
      }
      case 'heal_mp': {
        const restored = Math.max(0, Math.min(source.familiarData.stats.maxMp - source.currentMp, effect.value));
        mpHeal += restored;
        descriptions.push(`restores ${restored} MP`);
        break;
      }
      case 'damage':
        damage += effect.value;
        descriptions.push(`deals ${effect.value} damage`);
        break;
      case 'buff': {
        selfStatus = {
          abilityId: item.id,
          type: EffectType.Buff,
          stat: effect.stat,
          value: effect.value,
          turnsRemaining: effect.turns,
        };
        descriptions.push(
          `+${Math.round((effect.value - 1) * 100)}% ${STAT_LABELS[effect.stat]} for ${effect.turns} turn${effect.turns === 1 ? '' : 's'}`
        );
        break;
      }
      case 'debuff': {
        enemyStatus = {
          abilityId: item.id,
          type: EffectType.Debuff,
          stat: effect.stat,
          value: effect.value,
          turnsRemaining: effect.turns,
        };
        descriptions.push(
          `-${Math.round((1 - effect.value) * 100)}% enemy ${STAT_LABELS[effect.stat]} for ${effect.turns} turn${effect.turns === 1 ? '' : 's'}`
        );
        break;
      }
      case 'cure_status':
        cleanse = true;
        descriptions.push('cures status ailments');
        break;
      case 'revive_party':
      case 'grant_currency':
        // State-level: the backend applies these after the turn resolves.
        break;
    }
  }

  const description =
    descriptions.length > 0
      ? `${source.familiarData.name} uses ${item.name}: ${descriptions.join(', ')}`
      : `${source.familiarData.name} uses ${item.name}`;

  if (damage > 0 || enemyStatus) {
    return {
      effectType: EffectType.Damage,
      targetId: enemy.uid,
      value: damage,
      isCritical: false,
      description,
      appliedEffects: enemyStatus ? [enemyStatus] : undefined,
    };
  }

  if (hpHeal > 0 || mpHeal > 0 || selfStatus) {
    return {
      effectType: hpHeal > 0 ? EffectType.Heal : selfStatus ? EffectType.Buff : EffectType.MpHeal,
      targetId: source.uid,
      value: hpHeal > 0 ? hpHeal : selfStatus ? selfStatus.value : mpHeal,
      isCritical: false,
      description,
      // mpValue is the SECONDARY channel: only set when the primary effect is
      // not MpHeal itself, otherwise applyActionResult would add MP twice.
      mpValue: hpHeal > 0 && mpHeal > 0 ? mpHeal : undefined,
      appliedEffects: selfStatus ? [selfStatus] : undefined,
      cleanse,
    };
  }

  return {
    effectType: EffectType.Heal,
    targetId: source.uid,
    value: 0,
    isCritical: false,
    description,
    cleanse,
  };
}

function executeAction(
  action: BattleAction,
  source: BattleFamiliar,
  target: BattleFamiliar,
  rng: () => number
): ActionResult {
  let actualTarget: BattleFamiliar;

  if (action.type === ActionType.Item) {
    actualTarget = source;
  } else if (action.type === ActionType.Ability && action.abilityId) {
    const ability = getAbility(action.abilityId);
    if (ability) {
      actualTarget = ability.target === Target.Self || ability.target === Target.Ally ? source : target;
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

    return applyItemEffects(item, source, target);
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
  rng: () => number
): ActionResult {
  if (ability.effectType === EffectType.Damage) {
    const { damage, isCritical } = calculateDamage(source, target, ability.multiplier, ability.scalingStat, rng);

    const statusEffects = ability.statusEffect
      ? [
          {
            abilityId: ability.id,
            type: ability.statusEffect.type,
            stat: ability.statusEffect.stat,
            value: ability.statusEffect.value,
            turnsRemaining: ability.statusEffect.duration,
          },
        ]
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
      ? [
          {
            abilityId: ability.id,
            type: ability.statusEffect.type,
            stat: ability.statusEffect.stat,
            value: ability.statusEffect.value,
            turnsRemaining: ability.statusEffect.duration,
          },
        ]
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
      ? [
          {
            abilityId: ability.id,
            type: ability.statusEffect.type,
            stat: ability.statusEffect.stat,
            value: ability.statusEffect.value,
            turnsRemaining: ability.statusEffect.duration,
          },
        ]
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
export function checkBattleOutcome(playerFamiliar: BattleFamiliar, enemyFamiliar: BattleFamiliar): Outcome {
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
 * Tick down all cooldowns by one, then set the cooldown of `usedAbilityId`
 * (so a cooldown of N makes the ability unusable for N turns). Pass null or
 * omit it when the actor never executed (KO-canceled) so no cooldown starts.
 */
export function updateCooldowns(familiar: BattleFamiliar, usedAbilityId?: string | null): BattleFamiliar {
  const cooldowns: Record<string, number> = {};
  for (const key of Object.keys(familiar.cooldowns)) {
    cooldowns[key] = Math.max(0, familiar.cooldowns[key] - 1);
  }
  if (usedAbilityId) {
    const ability = getAbility(usedAbilityId);
    if (ability) {
      cooldowns[usedAbilityId] = ability.cooldown;
    }
  }
  return { ...familiar, cooldowns };
}
