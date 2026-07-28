import type { BattleAction, BattleFamiliar } from '../types/battle';
import { getAbility } from '../data/abilities';

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
      if (ability && ability.effectType === 'heal' && ability.target === 'ally' && enemy.currentMp >= ability.mpCost) {
        return { type: 'ability', abilityId, targetId: enemy.familiarData.id };
      }
    }
    // Also check self-heal abilities
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (ability && ability.effectType === 'heal' && ability.target === 'self' && enemy.currentMp >= ability.mpCost) {
        return { type: 'ability', abilityId, targetId: enemy.familiarData.id };
      }
    }
  }

  // 2. Check for buff if not already buffed
  const hasBuffs = enemy.statusEffects.some((e) => e.type === 'buff');
  if (!hasBuffs && rng() < 0.5) {
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (ability && ability.effectType === 'buff' && enemy.currentMp >= ability.mpCost) {
        return { type: 'ability', abilityId, targetId: enemy.familiarData.id };
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
        (ability.effectType === 'damage' || ability.effectType === 'damage_debuff') &&
        enemy.currentMp >= ability.mpCost
      ) {
        if (!bestDamageAbility || ability.multiplier > bestDamageAbility.multiplier) {
          bestDamageAbility = { id: abilityId, multiplier: ability.multiplier };
        }
      }
    }
    if (bestDamageAbility) {
      return { type: 'ability', abilityId: bestDamageAbility.id, targetId: player.familiarData.id };
    }
  }

  // 4. Basic attack
  return { type: 'attack', targetId: player.familiarData.id };
}
