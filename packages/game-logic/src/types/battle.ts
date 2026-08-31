import type { StatName, EffectType } from '@/data/abilities';
import type { FamiliarData } from '@/data/familiars';

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
  /** Removes Debuff/Dot status effects from the target (item cleanse). */
  cleanse?: boolean;
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
  /** Set when the active familiar was KO'd and a living party member
   *  involuntarily took its place (battleOutcome is then Continue). */
  forcedSwap?: ForcedSwapInfo;
}

export interface BattleRewards {
  currency: number;
  items: string[];
}

export enum BattleResult {
  Won,
  Lost,
  Active,
  Fled,
}
export interface BattleState {
  id: string;
  playerFamiliar: BattleFamiliar;
  enemyFamiliar: BattleFamiliar;
  isBoss: boolean;
  turnCount: number;
  status: BattleResult;
  swapsThisTurn?: number;
  seed?: number;
}
