import { ActionType, type BattleAction, type BattleFamiliar } from '@/types/battle';
import { getAbility, Target, EffectType } from '@/data/abilities';
import { BALANCE } from '@/data/balance';

function isOnCooldown(enemy: BattleFamiliar, abilityId: string): boolean {
  return (enemy.cooldowns?.[abilityId] ?? 0) > 0;
}

/**
 * Strongest affordable, off-cooldown ability of the requested kind.
 * `directOnly` restricts the search to abilities that deal immediate damage —
 * a charged boss must not spend its stored power on a DoT applicator that deals
 * no direct damage.
 */
function strongestDamageAbility(enemy: BattleFamiliar, directOnly: boolean): string | undefined {
  let best: { id: string; multiplier: number } | null = null;
  for (const abilityId of enemy.familiarData.abilities) {
    const ability = getAbility(abilityId);
    if (!ability) continue;
    if (isOnCooldown(enemy, abilityId)) continue;
    if (enemy.currentMp < ability.mpCost) continue;
    const damaging = ability.effectType === EffectType.Damage || (!directOnly && ability.effectType === EffectType.Dot);
    if (!damaging) continue;
    if (!best || ability.multiplier > best.multiplier) {
      best = { id: abilityId, multiplier: ability.multiplier };
    }
  }
  return best?.id;
}

/**
 * Select an enemy action using a priority-based decision tree:
 * 0. Boss or volatile elite: already charged → unleash the strongest direct
 *    damaging ability, else basic attack (no RNG draw).
 * 1. If HP < 30% AND has heal ability AND MP >= heal cost → use heal
 * 2. Boss / volatile elite: if rng() < the charge chance → gather power (Charge)
 * 3. If has buff available AND not already buffed → use buff (50% chance)
 * 4. If has damage ability AND MP >= cost → use strongest damage (70% chance)
 * 5. Else → basic attack
 *
 * The charge roll is inserted before the buff check, so ordinary non-elite
 * enemies draw exactly the same RNG sequence they always have. A boss in phase
 * two charges at `bossPhaseTwoChargeChance` instead of the base rate.
 */
export function selectEnemyAction(enemy: BattleFamiliar, player: BattleFamiliar, rng: () => number): BattleAction {
  const isBoss = enemy.familiarData.isBoss === true;
  // Volatile elites reuse the boss charge cycle. A phase-two boss charges more
  // often for the rest of the battle.
  const chargeChance = isBoss
    ? enemy.phaseTwo
      ? BALANCE.bossPhaseTwoChargeChance
      : BALANCE.bossChargeChance
    : enemy.elite === 'volatile'
      ? BALANCE.eliteChargeChance
      : undefined;

  // 0. A charged boss (or volatile elite) always unleashes: strongest direct
  // damage ability if one is usable, otherwise a basic attack.
  if (chargeChance !== undefined && enemy.charged) {
    const abilityId = strongestDamageAbility(enemy, true);
    if (abilityId) {
      return { type: ActionType.Ability, abilityId, targetId: player.uid };
    }
    return { type: ActionType.Attack, targetId: player.uid };
  }

  const hpPercent = enemy.currentHp / enemy.familiarData.stats.maxHp;

  // 1. Check for heal when low HP
  if (hpPercent < 0.3) {
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (
        ability &&
        !isOnCooldown(enemy, abilityId) &&
        ability.effectType === EffectType.Heal &&
        ability.target === Target.Ally &&
        enemy.currentMp >= ability.mpCost
      ) {
        return { type: ActionType.Ability, abilityId, targetId: enemy.uid };
      }
    }
    // Also check self-heal abilities
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (
        ability &&
        !isOnCooldown(enemy, abilityId) &&
        ability.effectType === EffectType.Heal &&
        ability.target === Target.Self &&
        enemy.currentMp >= ability.mpCost
      ) {
        return { type: ActionType.Ability, abilityId, targetId: enemy.uid };
      }
    }
  }

  // 2. Boss / volatile-elite telegraphed heavy attack.
  if (chargeChance !== undefined && rng() < chargeChance) {
    return { type: ActionType.Charge, targetId: enemy.uid };
  }

  // 3. Check for buff if not already buffed
  const hasBuffs = enemy.statusEffects.some((e) => e.type === EffectType.Buff);
  if (!hasBuffs && rng() < 0.5) {
    for (const abilityId of enemy.familiarData.abilities) {
      const ability = getAbility(abilityId);
      if (
        ability &&
        !isOnCooldown(enemy, abilityId) &&
        ability.effectType === EffectType.Buff &&
        enemy.currentMp >= ability.mpCost
      ) {
        return { type: ActionType.Ability, abilityId, targetId: enemy.uid };
      }
    }
  }

  // 4. Use strongest damage ability (70% chance)
  if (rng() < 0.7) {
    const abilityId = strongestDamageAbility(enemy, false);
    if (abilityId) {
      return { type: ActionType.Ability, abilityId, targetId: player.uid };
    }
  }

  // 5. Basic attack
  return { type: ActionType.Attack, targetId: player.uid };
}
