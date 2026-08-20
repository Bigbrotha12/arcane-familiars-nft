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
  Run
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
}

export enum Outcome {
  Win,
  Loss,
  Continue
}

export interface BattleTurnResult {
  playerAction: ActionResult;
  enemyAction: ActionResult;
  playerFamiliar: BattleFamiliar;
  enemyFamiliar: BattleFamiliar;
  battleOutcome: Outcome;
  rewards?: BattleRewards;
}

export interface BattleRewards {
  currency: number;
  items: string[];
}

export enum BattleResult {
  Won,
  Lost,
  Active,
  Fled
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
