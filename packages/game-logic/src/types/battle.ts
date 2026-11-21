import type { StatName, EffectType } from '@/data/abilities';
import type { CharmRoll } from '@/data/charms';
import type { EliteId } from '@/data/elites';
import type { FamiliarData } from '@/data/familiars';
import type { ActivePassive } from '@/data/passives';
import type { Inventory } from '@/types/gameState';

export interface BattleFamiliar {
  /** Unique identity of this combatant within the battle. Unlike `familiarData.id`
   *  (a species id), two combatants can never share a uid, so targeting is unambiguous. */
  uid: string;
  familiarData: FamiliarData;
  currentHp: number;
  currentMp: number;
  statusEffects: StatusEffect[];
  cooldowns: Record<string, number>;
  isAlly: boolean;
  /** Set by ActionType.Charge and spent by the next damaging action
   *  (boss telegraphed heavy attack). Persisted with the battle JSON. */
  charged?: boolean;
  /** Second Wind already fired for this combatant in this battle. */
  secondWindUsed?: boolean;
  /** Relay Instinct: MP fraction discounted from this combatant's next ability
   *  (0..1, 1 = free). Set when it swaps in; cleared by the first ability. */
  relayDiscount?: number;
  /** Elite affix applied to this combatant at battle start. Optional so normal
   *  enemies and battles persisted before elites existed still load. */
  elite?: EliteId;
  /** Boss entered phase two (set once, at or below 50% HP). Optional for old
   *  battles and non-boss combatants. */
  phaseTwo?: boolean;
}

export interface StatusEffect {
  abilityId: string;
  type: EffectType;
  stat: StatName;
  value: number;
  turnsRemaining: number;
}

export enum ActionType {
  Attack,
  Ability,
  Defend,
  Item,
  Run,
  /** Enemy-only: gather power, doubling the next damaging action. */
  Charge,
}

export interface BattleAction {
  type: ActionType;
  abilityId?: string;
  itemId?: string;
  targetId?: string;
}

export interface ActionResult {
  effectType: EffectType;
  /** uid of the combatant this result applies to. */
  targetId: string;
  value: number;
  isCritical: boolean;
  description: string;
  appliedEffects?: StatusEffect[];
  /** Secondary MP restoration applied alongside the primary effect (multi-effect items). */
  mpValue?: number;
  /** MP restored to the acting combatant by this action (basic-attack MP regain). */
  actorMpRestore?: number;
  /** Removes Debuff/Dot status effects from the target (item cleanse). */
  cleanse?: boolean;
  /** Affinity matchup that scaled a direct hit (omitted when neutral). */
  effectiveness?: 'strong' | 'weak';
  /** True when the target's Defend guard reduced this result's damage. */
  guarded?: boolean;
  /**
   * Fraction of the backup familiar's max HP healed by a party heal (Heal Pulse).
   * The engine stays pure: the backend applies this to the living non-fighting
   * party member's dungeon HP.
   */
  benchHealFraction?: number;
}

export enum Outcome {
  Win,
  Loss,
  Continue,
}

/** One executed action within a resolved turn, in playback order. */
export interface TurnStep {
  /** uid of the familiar that acted. */
  actorUid: string;
  result: ActionResult;
  /** Full combatant states AFTER this step applied (snapshots for client playback). */
  playerAfter: BattleFamiliar;
  enemyAfter: BattleFamiliar;
}

/** An action that was skipped because its actor was KO'd before it could act. */
export interface CanceledAction {
  uid: string;
  reason: string;
}

/** Involuntary substitution fired by the battle action endpoint when the
 *  active familiar is KO'd while another living party member remains: the
 *  next member relays into the battle instead of ending the dungeon run.
 *  Names only — clients compose their own log/message text. */
export interface ForcedSwapInfo {
  /** Display name of the familiar that fell. */
  fallenName: string;
  /** Display name of the party member who stepped in. */
  incomingName: string;
}

export interface BattleTurnResult {
  playerAction: ActionResult;
  enemyAction: ActionResult;
  playerFamiliar: BattleFamiliar;
  enemyFamiliar: BattleFamiliar;
  battleOutcome: Outcome;
  rewards?: BattleRewards;
  /** Executed actions in playback order (speed-ordered). */
  steps: TurnStep[];
  /** Actions skipped because their actor was KO'd before it could act. */
  canceledActions: CanceledAction[];
  /** Set on defeat: run loot discarded because the party fell. */
  lostLoot?: Inventory;
  /** Set when the active familiar was KO'd and a living party member
   *  involuntarily took its place (battleOutcome is then Continue). */
  forcedSwap?: ForcedSwapInfo;
  /** Bench member healed by the player's Heal Pulse this turn (if any). */
  benchHealed?: { familiarId: string; name: string; amount: number };
}

export interface BattleRewards {
  currency: number;
  items: string[];
  /** Epic chest from a first boss clear; banked with the run loot. */
  bossChest?: { items: string[]; currency: number; charm?: CharmRoll };
  /** Rare chest from an elite victory; banked with the run loot. */
  eliteChest?: { items: string[]; currency: number; charm?: CharmRoll };
  /** Daily Expedition first-clear bonus (coins plus an epic chest). */
  dailyBonus?: { currency: number; items: string[]; charm?: CharmRoll };
  /** XP awarded to the active familiar. */
  xp?: number;
  /** The active familiar's XP was boosted by the catch-up multiplier. */
  xpCatchUp?: boolean;
  /** Number of levels gained by the active familiar. */
  levelUp?: number;
  /** XP awarded to the party member who did not land the winning blow. */
  benchXp?: number;
  /** The bench party member's XP was boosted by the catch-up multiplier. */
  benchXpCatchUp?: boolean;
  /** Species id of that bench party member. */
  benchFamiliarId?: string;
  /** Number of levels gained by the bench party member. */
  benchLevelUp?: number;
  /** Species id recruited after a non-boss victory. */
  recruitedFamiliar?: string;
  /** Display name of the recruited familiar. */
  recruitedName?: string;
  /** Level the recruited familiar joined at. */
  recruitedLevel?: number;
  /** Bond progress after an unowned species was beaten but not recruited. */
  recruitProgress?: {
    familiarId: string;
    name: string;
    bond: number;
    needed: number;
  };
  /** Abilities unlocked by level-ups earned in this battle. */
  learned?: {
    familiarId: string;
    familiarName: string;
    abilityId: string;
    abilityName: string;
  }[];
  /** Passive tiers unlocked by level-ups earned in this battle. */
  passiveUnlocks?: {
    familiarId: string;
    familiarName: string;
    passiveId: string;
    passiveName: string;
    tier: number;
  }[];
}

export enum BattleResult {
  Won,
  Lost,
  Active,
  Fled,
}
export interface BattleState {
  id: string;
  /** Room whose pending encounter this battle belongs to. Persisted so a win
   *  resolves the fought room, not wherever the player has since moved. Optional
   *  for battles persisted before this field existed. */
  roomId?: string;
  playerFamiliar: BattleFamiliar;
  enemyFamiliar: BattleFamiliar;
  isBoss: boolean;
  /** Level the enemy was scaled to at battle start (drives XP). Optional for
   *  battles persisted before the field existed. */
  enemyLevel?: number;
  turnCount: number;
  status: BattleResult;
  swapsThisTurn?: number;
  seed?: number;
  /** Party-wide passives active for the whole battle (player side only).
   *  Optional so battles persisted before passives existed still load. */
  playerPassives?: ActivePassive[];
  /**
   * Species ids that have spent a once-per-battle passive effect. Kept on the
   * battle, not the combatant, so swapping out and back in cannot reset Second
   * Wind or re-grant the Relay Instinct discount.
   */
  passiveUses?: { secondWind: string[]; relay: string[] };
  /**
   * A brand-new player's first fight: the enemy is scaled to the area's minimum
   * level and the one-time guided save (below) applies. Optional so battles
   * persisted before guided battles existed still load.
   */
  guided?: boolean;
  /** The guided save has already kept the player's familiar at 1 HP once. */
  guidedSaveUsed?: boolean;
}
