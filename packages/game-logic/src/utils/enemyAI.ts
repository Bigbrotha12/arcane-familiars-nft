import { ActionType, type BattleAction, type BattleFamiliar } from '@/types/battle';
import { getAbility, Target, EffectType } from '@/data/abilities';

function isOnCooldown(enemy: BattleFamiliar, abilityId: string): boolean {
  return (enemy.cooldowns?.[abilityId] ?? 0) > 0;
}

/**
 * Select an enemy action using a priority-based decision tree:
 * 1. If HP < 30% AND has heal ability AND MP >= heal cost → use heal
 * 2. If has buff available AND not already buffed → use buff (50% chance)
 * 3. If has damage ability AND MP >= cost → use strongest damage (70% chance)
 * 4. Else → basic attack
 */
export function selectEnemyAction(
  enemy: BattleFamiliar,
  player: BattleFamiliar,
  rng: () => number,
): BattleAction {
  const hpPercent = enemy.currentHp / enemy.familiarData.stats.maxHp;

  // 1. Check for heal when low HP
  if (hpPercent < 0.3) {
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (ability && !isOnCooldown(enemy, abilityId) && ability.effectType === EffectType.Heal && ability.target === Target.Ally && enemy.currentMp >= ability.mpCost) {
        return { type: ActionType.Ability, abilityId, targetId: enemy.familiarData.id };
      }
    }
    // Also check self-heal abilities
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (ability && !isOnCooldown(enemy, abilityId) && ability.effectType === EffectType.Heal && ability.target === Target.Self && enemy.currentMp >= ability.mpCost) {
        return { type: ActionType.Ability, abilityId, targetId: enemy.familiarData.id };
      }
    }
  }

  // 2. Check for buff if not already buffed
  const hasBuffs = enemy.statusEffects.some((e) => e.type === EffectType.Buff);
  if (!hasBuffs && rng() < 0.5) {
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (ability && !isOnCooldown(enemy, abilityId) && ability.effectType === EffectType.Buff && enemy.currentMp >= ability.mpCost) {
        return { type: ActionType.Ability, abilityId, targetId: enemy.familiarData.id };
      }
    }
  }

  // 3. Use strongest damage ability (70% chance)
  if (rng() < 0.7) {
    let bestDamageAbility: { id: string; multiplier: number } | null = null;
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (
        ability &&
        !isOnCooldown(enemy, abilityId) &&
        (ability.effectType === EffectType.Damage || ability.effectType === EffectType.Dot) &&
        enemy.currentMp >= ability.mpCost
      ) {
        if (!bestDamageAbility || ability.multiplier > bestDamageAbility.multiplier) {
          bestDamageAbility = { id: abilityId, multiplier: ability.multiplier };
        }
      }
    }
    if (bestDamageAbility) {
      return { type: ActionType.Ability, abilityId: bestDamageAbility.id, targetId: player.familiarData.id };
    }
  }

  // 4. Basic attack
  return { type: ActionType.Attack, targetId: player.familiarData.id };
}
