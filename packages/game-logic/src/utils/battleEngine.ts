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
import { BALANCE, affinityEffectiveness, affinityMultiplier, type AffinityEffectiveness } from '@/data/balance';
import type { ActivePassive, PassiveId } from '@/data/passives';

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

export interface DamageOptions {
  /** The defender is guarding this turn (its action was Defend). */
  defenderGuarding?: boolean;
  /** Extra multiplier applied to a direct hit (player passives). */
  damageMultiplier?: number;
  /** Guard multiplier used instead of `BALANCE.guardDamageTaken` (Bedrock). */
  guardMultiplier?: number;
}

/**
 * Damage for a direct hit (basic attack or damaging ability).
 *
 * Order of operations, fixed by contract:
 *   base      = attackerStat * multiplier * defenseScale / (defenseScale + defenderStat)
 *   x affinity, x crit, x variance, x guard, x boss charge
 * then clamped to a minimum of 1 and rounded.
 *
 * RNG draw order is also fixed: the crit roll is drawn first, then the variance
 * roll, and both are always drawn so a seeded run consumes exactly two values
 * per damaging hit regardless of the outcome.
 */
export function calculateDamage(
  attacker: BattleFamiliar,
  defender: BattleFamiliar,
  abilityMultiplier: number,
  scalingStat: ScalingStat,
  rng: () => number,
  options: DamageOptions = {}
): { damage: number; isCritical: boolean; effectiveness: AffinityEffectiveness } {
  const { damage, isCritical, effectiveness } = rollDamage(
    attacker,
    defender,
    abilityMultiplier,
    scalingStat,
    rng,
    options
  );
  return { damage, isCritical, effectiveness };
}

/** Internal roll that also reports whether the guard reduced the hit. */
function rollDamage(
  attacker: BattleFamiliar,
  defender: BattleFamiliar,
  abilityMultiplier: number,
  scalingStat: ScalingStat,
  rng: () => number,
  options: DamageOptions = {}
): { damage: number; isCritical: boolean; effectiveness: AffinityEffectiveness; guarded: boolean } {
  const offensiveStat =
    scalingStat === ScalingStat.Arcane ? attacker.familiarData.stats.arcane : attacker.familiarData.stats.attack;
  const attackerStat = getEffectiveStat(offensiveStat, attacker.statusEffects, toStatName(scalingStat));
  const defenderStat = getEffectiveStat(defender.familiarData.stats.defense, defender.statusEffects, StatName.Defense);

  const isCritical = rng() < BALANCE.critChance;
  const varianceRoll = rng();
  const variance = 1 - BALANCE.damageVariance + varianceRoll * BALANCE.damageVariance * 2;

  const effectiveness = affinityEffectiveness(attacker.familiarData.affinity, defender.familiarData.affinity);

  let rawDamage = (attackerStat * abilityMultiplier * BALANCE.defenseScale) / (BALANCE.defenseScale + defenderStat);
  rawDamage *= affinityMultiplier(attacker.familiarData.affinity, defender.familiarData.affinity);
  if (isCritical) {
    rawDamage *= BALANCE.critMultiplier;
  }
  rawDamage *= variance;
  if (options.damageMultiplier) {
    rawDamage *= options.damageMultiplier;
  }

  let total = rawDamage;
  if (options.defenderGuarding) {
    total *= options.guardMultiplier ?? BALANCE.guardDamageTaken;
  }
  if (attacker.charged) {
    total *= BALANCE.bossChargeMultiplier;
  }
  if (attacker.phaseTwo) {
    total *= BALANCE.bossPhaseTwoAttack;
  }
  const damage = Math.max(1, Math.round(total));

  // "guarded" means the guard actually reduced the rounded result — at the
  // 1-damage floor it is not reported as a reduction.
  let unguardedRaw = rawDamage;
  if (attacker.charged) {
    unguardedRaw *= BALANCE.bossChargeMultiplier;
  }
  if (attacker.phaseTwo) {
    unguardedRaw *= BALANCE.bossPhaseTwoAttack;
  }
  const guarded = options.defenderGuarding === true && Math.max(1, Math.round(unguardedRaw)) > damage;

  return { damage, isCritical, effectiveness, guarded };
}

/** Log suffix for affinity / guard modifiers, appended to a hit's description. */
function damageSuffix(effectiveness: AffinityEffectiveness, guarded: boolean): string {
  let suffix = '';
  if (effectiveness === 'strong') suffix += " It's super effective!";
  else if (effectiveness === 'weak') suffix += " It's not very effective…";
  if (guarded) suffix += ' (guarded)';
  return suffix;
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
 * Player-only passive lookup used by the turn resolver. Duplicate ids keep the
 * highest tier, mirroring `partyPassives` (no stacking).
 */
interface PassiveRuntime {
  playerUid: string;
  value(id: PassiveId): number;
  tier(id: PassiveId): 0 | 1 | 2 | 3 | 4;
}

function makePassiveRuntime(playerUid: string, passives: ActivePassive[]): PassiveRuntime {
  const byId = new Map<PassiveId, ActivePassive>();
  for (const passive of passives) {
    const current = byId.get(passive.id);
    if (!current || passive.tier > current.tier) byId.set(passive.id, passive);
  }
  return {
    playerUid,
    value: (id) => byId.get(id)?.value ?? 0,
    tier: (id) => byId.get(id)?.tier ?? 0,
  };
}

/** MP an ability actually costs after a Relay Instinct discount. */
export function effectiveAbilityCost(ability: AbilityData, relayDiscount = 0): number {
  const discount = Math.max(0, Math.min(1, relayDiscount));
  return Math.max(0, Math.round(ability.mpCost * (1 - discount)));
}

/** Player-side direct-damage bonus from Battle Cry and Umbral Hunger. */
function playerDamageMultiplier(
  source: BattleFamiliar,
  target: BattleFamiliar,
  runtime: PassiveRuntime,
  ability?: AbilityData
): number {
  if (source.uid !== runtime.playerUid) return 1;

  let multiplier = 1;
  if (ability && ability.scalingStat === ScalingStat.Attack) {
    multiplier *= 1 + runtime.value('battleCry');
  }
  const afflicted = target.statusEffects.some(
    (effect) => effect.type === EffectType.Debuff || effect.type === EffectType.Dot
  );
  if (afflicted) multiplier *= 1 + runtime.value('umbralHunger');
  return multiplier;
}

/** Bedrock's guard multiplier for the player; undefined keeps the default. */
function guardMultiplierFor(defender: BattleFamiliar, runtime: PassiveRuntime, guarding: boolean): number | undefined {
  if (!guarding || defender.uid !== runtime.playerUid) return undefined;
  const bedrock = runtime.value('bedrock');
  return bedrock > 0 ? bedrock : undefined;
}

/** Scale a status effect the player applied (Kindling DoTs, Tidecaller HoTs). */
function scaleAppliedStatus(effect: StatusEffect, source: BattleFamiliar, runtime: PassiveRuntime): StatusEffect {
  if (source.uid !== runtime.playerUid) return effect;

  if (effect.type === EffectType.Dot) {
    const kindling = runtime.value('kindling');
    if (kindling > 0) {
      return {
        ...effect,
        value: Math.max(1, Math.round(effect.value * (1 + kindling))),
        turnsRemaining: effect.turnsRemaining + (runtime.tier('kindling') >= 3 ? 1 : 0),
      };
    }
  }

  if (effect.type === EffectType.Hot) {
    const tidecaller = runtime.value('tidecaller');
    if (tidecaller > 0) {
      return { ...effect, value: Math.max(1, Math.round(effect.value * (1 + tidecaller))) };
    }
  }

  return effect;
}

/**
 * Resolve a single battle turn. Actors are ordered by effective Speed (higher
 * first; ties go to the player, with no RNG roll so seeded runs stay
 * deterministic). Each actor executes against the states left by the previous
 * actor. An actor whose HP has dropped to 0 before its slot is canceled: it
 * does not execute, spends no MP and applies no effects — its result slot is
 * filled with a zero-damage placeholder carrying the cancel reason.
 *
 * `playerPassives` apply to the player side only; enemies and bosses have none.
 */
export function resolveTurn(
  playerAction: BattleAction,
  playerFamiliar: BattleFamiliar,
  enemyFamiliar: BattleFamiliar,
  enemyAction: BattleAction,
  rng: () => number,
  playerPassives: ActivePassive[] = []
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
  const runtime = makePassiveRuntime(playerFamiliar.uid, playerPassives);
  const playerSpeed = Math.round(
    getEffectiveStat(playerFamiliar.familiarData.stats.speed, playerFamiliar.statusEffects, StatName.Speed) *
      (1 + runtime.value('tailwind'))
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

  // Defend is a stance for the WHOLE turn, decided before initiative is
  // resolved: a guard applies even to a hit that lands before the guarding
  // actor's own slot. It is transient — no status effect is created and
  // nothing persists into the next turn.
  const guardingUids = new Set<string>();
  if (playerAction.type === ActionType.Defend) guardingUids.add(playerFamiliar.uid);
  if (enemyAction.type === ActionType.Defend) guardingUids.add(enemyFamiliar.uid);
  const isGuarding = (familiar: BattleFamiliar): boolean => guardingUids.has(familiar.uid);

  let playerCurrent = playerFamiliar;
  let enemyCurrent = enemyFamiliar;
  const steps: TurnStep[] = [];
  const canceledActions: CanceledAction[] = [];
  // Effects applied by ANY actor this turn must not proc or tick at end of turn.
  const freshEffects = new Set<StatusEffect>();

  // Boss phase two: the first time the boss is at or below half HP (after any
  // step, including end-of-turn ticks), it cleanses its debuffs/DoTs and fights
  // enraged for the rest of the battle. Recorded as its own step so clients
  // already render the log line from the step stream.
  const checkPhaseTwo = (): void => {
    if (!enemyCurrent.familiarData.isBoss || enemyCurrent.phaseTwo || enemyCurrent.currentHp <= 0) return;
    const maxHp = enemyCurrent.familiarData.stats.maxHp;
    if (enemyCurrent.currentHp > maxHp * 0.5) return;

    enemyCurrent = {
      ...enemyCurrent,
      phaseTwo: true,
      statusEffects: enemyCurrent.statusEffects.filter(
        (effect) => effect.type !== EffectType.Debuff && effect.type !== EffectType.Dot
      ),
    };
    steps.push({
      actorUid: enemyCurrent.uid,
      result: {
        effectType: EffectType.Buff,
        targetId: enemyCurrent.uid,
        value: 0,
        isCritical: false,
        description: `${enemyCurrent.familiarData.name} is enraged!`,
      },
      playerAfter: playerCurrent,
      enemyAfter: enemyCurrent,
    });
  };

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

    const execution = executeAction(action, actorPre, opponentPre, rng, isGuarding, runtime);
    const result = execution.result;
    let actorPost = applyActionResult(actorPre, result);
    const opponentPost = applyActionResult(opponentPre, result);

    // Basic attacks refund a slice of the actor's max MP. Applied to the actor
    // (not the result's target) so the per-step snapshot carries the new MP.
    if (result.actorMpRestore) {
      actorPost = {
        ...actorPost,
        currentMp: Math.min(actorPost.familiarData.stats.maxMp, actorPost.currentMp + result.actorMpRestore),
      };
    }

    // Charge is carried on the actor, not in the result, so the client can see
    // a charged boss before it unleashes. A damaging action spends it; every
    // other action leaves it intact.
    if (execution.consumedCharge) actorPost = { ...actorPost, charged: false };
    if (execution.gainedCharge) actorPost = { ...actorPost, charged: true };

    // Deduct MP for ability use. Relay Instinct discounts the first ability
    // after a swap-in; spending it clears the discount.
    let relayNote: { abilityName: string; cost: number; baseCost: number } | undefined;
    if (action.type === ActionType.Ability && action.abilityId) {
      const ability = getAbility(action.abilityId);
      if (ability) {
        const discount = isPlayer ? Math.max(0, Math.min(1, actorPre.relayDiscount ?? 0)) : 0;
        const cost = effectiveAbilityCost(ability, discount);
        if (actorPre.currentMp >= cost) {
          actorPost = {
            ...actorPost,
            currentMp: Math.max(0, actorPost.currentMp - cost),
            ...(isPlayer && discount > 0 ? { relayDiscount: undefined } : {}),
          };
          if (isPlayer && discount > 0) {
            relayNote = { abilityName: ability.name, cost, baseCost: ability.mpCost };
          }
        }
      }
    }

    if (result.appliedEffects) {
      for (const effect of result.appliedEffects) freshEffects.add(effect);
    }

    // HP before this step's effects, used to detect Second Wind's threshold drop.
    const playerHpBeforeStep = playerCurrent.currentHp;

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

    // Vampiric elite: after a direct hit lands, drain a share of the damage it
    // dealt back into its own HP (capped at max HP). Logged as its own step so
    // the hit and the heal read as two events, like other extra effects.
    if (
      !isPlayer &&
      actorPre.elite === 'vampiric' &&
      result.effectType === EffectType.Damage &&
      result.targetId === opponentPre.uid &&
      result.value > 0
    ) {
      const maxHp = enemyCurrent.familiarData.stats.maxHp;
      const drained = Math.min(
        Math.max(0, maxHp - enemyCurrent.currentHp),
        Math.round(result.value * BALANCE.eliteVampiricDrain)
      );
      if (drained > 0) {
        enemyCurrent = { ...enemyCurrent, currentHp: enemyCurrent.currentHp + drained };
        steps.push({
          actorUid: actorPre.uid,
          result: {
            effectType: EffectType.Heal,
            targetId: actorPre.uid,
            value: drained,
            isCritical: false,
            description: `${actorPre.familiarData.name} drains ${drained} HP`,
          },
          playerAfter: playerCurrent,
          enemyAfter: enemyCurrent,
        });
      }
    }

    checkPhaseTwo();

    if (relayNote) {
      steps.push({
        actorUid: runtime.playerUid,
        result: {
          effectType: EffectType.Buff,
          targetId: runtime.playerUid,
          value: 0,
          isCritical: false,
          description: `Relay Instinct! ${actorPost.familiarData.name} uses ${relayNote.abilityName} for ${relayNote.cost} MP instead of ${relayNote.baseCost}`,
        },
        playerAfter: playerCurrent,
        enemyAfter: enemyCurrent,
      });
    }

    // Second Wind: once per familiar per battle, immediately after the step in
    // which its HP first falls below 30% (but stays above 0).
    if (!playerCurrent.secondWindUsed && playerCurrent.currentHp > 0) {
      const maxHp = playerCurrent.familiarData.stats.maxHp;
      const threshold = maxHp * 0.3;
      if (playerHpBeforeStep >= threshold && playerCurrent.currentHp < threshold) {
        const secondWind = runtime.value('secondWind');
        const healed = Math.min(maxHp - playerCurrent.currentHp, Math.round(maxHp * secondWind));
        if (secondWind > 0 && healed > 0) {
          playerCurrent = {
            ...playerCurrent,
            currentHp: playerCurrent.currentHp + healed,
            secondWindUsed: true,
          };
          steps.push({
            actorUid: runtime.playerUid,
            result: {
              effectType: EffectType.Heal,
              targetId: runtime.playerUid,
              value: healed,
              isCritical: false,
              description: `Second Wind! ${playerCurrent.familiarData.name} recovers ${healed} HP`,
            },
            playerAfter: playerCurrent,
            enemyAfter: enemyCurrent,
          });
        }
      }
    }
  }

  // Tick status effects. Effects applied during this turn (by either side)
  // neither proc nor decrement — they have not existed for a full turn yet.
  playerCurrent = applyStatusEffects(playerCurrent, freshEffects);
  enemyCurrent = applyStatusEffects(enemyCurrent, freshEffects);

  // A DoT tick can carry the boss across the half-HP line after the last step.
  checkPhaseTwo();

  // Radiance: end-of-turn regen for the living fighting familiar.
  const radiance = runtime.value('radiance');
  if (radiance > 0 && playerCurrent.currentHp > 0) {
    const maxHp = playerCurrent.familiarData.stats.maxHp;
    const healed = Math.min(maxHp - playerCurrent.currentHp, Math.round(maxHp * radiance));
    if (healed > 0) {
      playerCurrent = { ...playerCurrent, currentHp: playerCurrent.currentHp + healed };
      steps.push({
        actorUid: runtime.playerUid,
        result: {
          effectType: EffectType.Heal,
          targetId: runtime.playerUid,
          value: healed,
          isCritical: false,
          description: `Radiance! ${playerCurrent.familiarData.name} recovers ${healed} HP`,
        },
        playerAfter: playerCurrent,
        enemyAfter: enemyCurrent,
      });
    }
  }

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
function applyItemEffects(
  item: ItemData,
  source: BattleFamiliar,
  enemy: BattleFamiliar,
  isGuarding: (familiar: BattleFamiliar) => boolean,
  runtime: PassiveRuntime
): ActionResult {
  const descriptions: string[] = [];
  let damage = 0;
  let hpHeal = 0;
  let mpHeal = 0;
  let cleanse = false;
  let selfStatus: StatusEffect | undefined;
  let enemyStatus: StatusEffect | undefined;
  const tidecaller = source.uid === runtime.playerUid ? runtime.value('tidecaller') : 0;
  const umbral = source.uid === runtime.playerUid ? runtime.value('umbralHunger') : 0;

  for (const effect of item.effects) {
    switch (effect.kind) {
      case 'heal_hp': {
        const amount = Math.round(effect.value * (1 + tidecaller));
        const healed = Math.max(0, Math.min(source.familiarData.stats.maxHp - source.currentHp, amount));
        hpHeal += healed;
        descriptions.push(`restores ${healed} HP`);
        break;
      }
      case 'heal_percentage': {
        const amount = Math.round(((source.familiarData.stats.maxHp * effect.percentage) / 100) * (1 + tidecaller));
        const healed = Math.max(0, Math.min(source.familiarData.stats.maxHp - source.currentHp, amount));
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
      case 'damage': {
        const amount = Math.round(
          effect.value *
            (1 +
              (umbral > 0 && enemy.statusEffects.some((e) => e.type === EffectType.Debuff || e.type === EffectType.Dot)
                ? umbral
                : 0))
        );
        damage += amount;
        descriptions.push(`deals ${amount} damage`);
        break;
      }
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
      case 'dot': {
        const scaled = scaleAppliedStatus(
          {
            abilityId: item.id,
            type: EffectType.Dot,
            stat: StatName.Hp,
            value: effect.value,
            turnsRemaining: effect.turns,
          },
          source,
          runtime
        );
        enemyStatus = scaled;
        descriptions.push(`deals ${scaled.value} damage per turn for ${scaled.turnsRemaining} turns`);
        break;
      }
      case 'hot': {
        const scaled = scaleAppliedStatus(
          {
            abilityId: item.id,
            type: EffectType.Hot,
            stat: StatName.Hp,
            value: effect.value,
            turnsRemaining: effect.turns,
          },
          source,
          runtime
        );
        selfStatus = scaled;
        descriptions.push(`restores ${scaled.value} HP per turn for ${scaled.turnsRemaining} turns`);
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

  // Item damage is flat (no affinity, crit, variance or charge). Only the
  // target's guard scales it, exactly like a direct hit.
  let guarded = false;
  if (damage > 0 && isGuarding(enemy)) {
    const guardMultiplier = guardMultiplierFor(enemy, runtime, true) ?? BALANCE.guardDamageTaken;
    const reduced = Math.max(1, Math.round(damage * guardMultiplier));
    guarded = Math.max(1, Math.round(damage)) > reduced;
    damage = reduced;
  }

  let description =
    descriptions.length > 0
      ? `${source.familiarData.name} uses ${item.name}: ${descriptions.join(', ')}`
      : `${source.familiarData.name} uses ${item.name}`;
  if (guarded) description += ' (guarded)';

  if (damage > 0 || enemyStatus) {
    return {
      effectType: EffectType.Damage,
      targetId: enemy.uid,
      value: damage,
      isCritical: false,
      description,
      appliedEffects: enemyStatus ? [enemyStatus] : undefined,
      guarded: guarded || undefined,
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

interface ExecutionOutcome {
  result: ActionResult;
  /** A stored charge was spent by this damaging action. */
  consumedCharge: boolean;
  /** This action stored a charge. */
  gainedCharge: boolean;
}

function executeAction(
  action: BattleAction,
  source: BattleFamiliar,
  target: BattleFamiliar,
  rng: () => number,
  isGuarding: (familiar: BattleFamiliar) => boolean = () => false,
  runtime: PassiveRuntime = { playerUid: '', value: () => 0, tier: () => 0 }
): ExecutionOutcome {
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
    const { damage, isCritical, effectiveness, guarded } = rollDamage(
      source,
      actualTarget,
      1.0,
      ScalingStat.Attack,
      rng,
      {
        defenderGuarding: isGuarding(actualTarget),
        damageMultiplier: playerDamageMultiplier(source, actualTarget, runtime),
        guardMultiplier: guardMultiplierFor(actualTarget, runtime, isGuarding(actualTarget)),
      }
    );
    const maxMp = source.familiarData.stats.maxMp;
    const restoreFraction =
      source.uid === runtime.playerUid && runtime.value('manaSpring') > 0
        ? runtime.value('manaSpring')
        : BALANCE.attackMpRestore;
    const restoredMp = Math.min(
      Math.max(0, maxMp - source.currentMp),
      Math.max(1, Math.round(maxMp * restoreFraction))
    );
    const mpNote = restoredMp > 0 ? ` (+${restoredMp} MP)` : '';
    return {
      result: {
        effectType: EffectType.Damage,
        targetId: actualTarget.uid,
        value: damage,
        isCritical,
        description: `${source.familiarData.name} attacks for ${damage} damage${isCritical ? ' (Critical!)' : ''}${damageSuffix(effectiveness, guarded)}${mpNote}`,
        effectiveness: effectiveness === 'neutral' ? undefined : effectiveness,
        guarded: guarded || undefined,
        actorMpRestore: restoredMp > 0 ? restoredMp : undefined,
      },
      consumedCharge: source.charged === true,
      gainedCharge: false,
    };
  }

  if (action.type === ActionType.Ability && action.abilityId) {
    const ability = getAbility(action.abilityId);
    if (!ability) {
      return {
        result: {
          effectType: EffectType.Damage,
          targetId: actualTarget.uid,
          value: 0,
          isCritical: false,
          description: 'Unknown ability used',
        },
        consumedCharge: false,
        gainedCharge: false,
      };
    }
    const relayDiscount = source.uid === runtime.playerUid ? (source.relayDiscount ?? 0) : 0;
    if (source.currentMp < effectiveAbilityCost(ability, relayDiscount)) {
      return {
        result: {
          effectType: EffectType.Damage,
          targetId: actualTarget.uid,
          value: 0,
          isCritical: false,
          description: `${source.familiarData.name} does not have enough MP to use ${ability.name}`,
        },
        consumedCharge: false,
        gainedCharge: false,
      };
    }
    return {
      result: executeAbility(ability, source, actualTarget, rng, isGuarding, runtime),
      // Only a direct damaging ability spends the charge; buffs, heals and
      // DoT-setting abilities leave it intact.
      consumedCharge: ability.effectType === EffectType.Damage && source.charged === true,
      gainedCharge: false,
    };
  }

  if (action.type === ActionType.Defend) {
    // Guard halves direct damage for the whole turn (computed in resolveTurn);
    // executing the stance also recovers a slice of max MP, capped by what is
    // actually missing so `value` is the MP truly restored.
    const maxMp = source.familiarData.stats.maxMp;
    const restoredMp = Math.max(0, Math.min(maxMp - source.currentMp, Math.round(maxMp * BALANCE.guardMpRestore)));
    return {
      result: {
        effectType: EffectType.MpHeal,
        targetId: source.uid,
        value: restoredMp,
        isCritical: false,
        description: `${source.familiarData.name} guards and recovers ${restoredMp} MP`,
      },
      consumedCharge: false,
      gainedCharge: false,
    };
  }

  if (action.type === ActionType.Charge) {
    return {
      result: {
        effectType: EffectType.Buff,
        targetId: source.uid,
        value: 0,
        isCritical: false,
        description: `${source.familiarData.name} is gathering power!`,
      },
      consumedCharge: false,
      gainedCharge: true,
    };
  }

  if (action.type === ActionType.Run) {
    return {
      result: {
        effectType: EffectType.Damage,
        targetId: source.uid,
        value: 0,
        isCritical: false,
        description: `${source.familiarData.name} attempts to flee`,
      },
      consumedCharge: false,
      gainedCharge: false,
    };
  }

  if (action.type === ActionType.Item && action.itemId) {
    const item = getItem(action.itemId);
    if (!item || item.type !== ItemType.Consumable) {
      return {
        result: {
          effectType: EffectType.Damage,
          targetId: source.uid,
          value: 0,
          isCritical: false,
          description: `Unknown or non-consumable item: ${action.itemId}`,
        },
        consumedCharge: false,
        gainedCharge: false,
      };
    }

    return {
      result: applyItemEffects(item, source, target, isGuarding, runtime),
      consumedCharge: false,
      gainedCharge: false,
    };
  }

  return {
    result: {
      effectType: EffectType.Damage,
      targetId: actualTarget.uid,
      value: 0,
      isCritical: false,
      description: 'No action taken',
    },
    consumedCharge: false,
    gainedCharge: false,
  };
}

/**
 * Effective damage multiplier of an ability for a given user. Abilities with a
 * `lowHpBonus` (Brave) hit harder as the user's HP falls:
 * `multiplier + lowHpBonus * (1 - currentHp / maxHp)`. Never below the base.
 */
export function effectiveAbilityMultiplier(ability: AbilityData, source: BattleFamiliar): number {
  if (!ability.lowHpBonus) return ability.multiplier;
  const maxHp = source.familiarData.stats.maxHp;
  const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, source.currentHp / maxHp)) : 0;
  return ability.multiplier + ability.lowHpBonus * (1 - hpRatio);
}

function executeAbility(
  ability: AbilityData,
  source: BattleFamiliar,
  target: BattleFamiliar,
  rng: () => number,
  isGuarding: (familiar: BattleFamiliar) => boolean = () => false,
  runtime: PassiveRuntime = { playerUid: '', value: () => 0, tier: () => 0 }
): ActionResult {
  const scaleStatuses = (effectType = ability.statusEffect?.type) =>
    ability.statusEffect
      ? [
          scaleAppliedStatus(
            {
              abilityId: ability.id,
              type: effectType ?? ability.statusEffect.type,
              stat: ability.statusEffect.stat,
              value: ability.statusEffect.value,
              turnsRemaining: ability.statusEffect.duration,
            },
            source,
            runtime
          ),
        ]
      : undefined;

  if (ability.effectType === EffectType.Damage) {
    const { damage, isCritical, effectiveness, guarded } = rollDamage(
      source,
      target,
      effectiveAbilityMultiplier(ability, source),
      ability.scalingStat,
      rng,
      {
        defenderGuarding: isGuarding(target),
        damageMultiplier: playerDamageMultiplier(source, target, runtime, ability),
        guardMultiplier: guardMultiplierFor(target, runtime, isGuarding(target)),
      }
    );

    const statusEffects = scaleStatuses();

    // Below half HP the low-HP bonus is worth calling out in the log.
    const hpRatio = source.familiarData.stats.maxHp > 0 ? source.currentHp / source.familiarData.stats.maxHp : 0;
    const desperate = (ability.lowHpBonus ?? 0) > 0 && hpRatio < 0.5;
    const actionText = desperate ? `uses ${ability.name} — a desperate blow! —` : `uses ${ability.name}`;

    return {
      effectType: ability.effectType,
      targetId: target.uid,
      value: damage,
      isCritical,
      description: `${source.familiarData.name} ${actionText} for ${damage} damage${isCritical ? ' (Critical!)' : ''}${damageSuffix(effectiveness, guarded)}`,
      appliedEffects: statusEffects,
      effectiveness: effectiveness === 'neutral' ? undefined : effectiveness,
      guarded: guarded || undefined,
    };
  }

  if (ability.effectType === EffectType.Heal) {
    // Bosses have several times a normal familiar's HP, so a %-of-max heal
    // would undo whole turns of the player's work; scale theirs down.
    const healScale = source.familiarData.isBoss ? BALANCE.bossHealScale : 1;
    const tidecaller = source.uid === runtime.playerUid ? runtime.value('tidecaller') : 0;
    const healAmount = Math.round(target.familiarData.stats.maxHp * ability.multiplier * healScale * (1 + tidecaller));

    const statusEffects = scaleStatuses();

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
    const statusEffects = scaleStatuses();

    return {
      effectType: EffectType.Buff,
      targetId: source.uid,
      value: ability.multiplier,
      isCritical: false,
      description: `${source.familiarData.name} uses ${ability.name}`,
      appliedEffects: statusEffects,
    };
  }

  if (ability.effectType === EffectType.Debuff) {
    const statusEffects = scaleStatuses();

    return {
      effectType: EffectType.Debuff,
      targetId: target.uid,
      value: 0,
      isCritical: false,
      description: `${source.familiarData.name} uses ${ability.name}`,
      appliedEffects: statusEffects,
    };
  }

  if (ability.effectType === EffectType.Dot) {
    const statusEffects = scaleStatuses(EffectType.Dot);

    return {
      effectType: EffectType.Dot,
      targetId: target.uid,
      value: 0,
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
