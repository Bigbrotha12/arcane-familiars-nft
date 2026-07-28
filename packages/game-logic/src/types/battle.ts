import type { AbilityEffectType } from '../data/abilities';
import type { FamiliarData } from '../data/familiars';

export interface BattleFamiliar {
  familiarData: FamiliarData;
  currentHp: number;
  currentMp: number;
  statusEffects: StatusEffect[];
  cooldowns: Record<string, number>;
  isAlly: boolean;
}

export interface StatusEffect {
  abilityId: string;
  type: 'buff' | 'debuff' | 'dot' | 'hot';
  stat: string;
  value: number;
  turnsRemaining: number;
}

export interface BattleAction {
  type: 'attack' | 'ability' | 'defend' | 'item' | 'run';
  abilityId?: string;
  itemId?: string;
  targetId?: string;
}

export interface ActionResult {
  effectType: AbilityEffectType;
  targetId: string;
  value: number;
  isCritical: boolean;
  description: string;
}

export interface BattleTurnResult {
  playerAction: ActionResult;
  enemyAction: ActionResult;
  playerFamiliar: BattleFamiliar;
  enemyFamiliar: BattleFamiliar;
  battleOutcome: 'win' | 'lose' | 'continue';
  rewards?: BattleRewards;
}

export interface BattleRewards {
  currency: number;
  items: string[];
}

export interface BattleState {
  id: string;
  playerFamiliar: BattleFamiliar;
  enemyFamiliar: BattleFamiliar;
  isBoss: boolean;
  turnCount: number;
  status: 'active' | 'won' | 'lost' | 'fled';
}
