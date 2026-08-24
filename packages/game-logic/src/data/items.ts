import { StatName } from '@/data/abilities';

export enum ItemType {
  Consumable,
  Equipment
}

/**
 * Effects applied by the battle engine during resolveTurn (combat-level:
 * HP/MP/damage/status on the two active combatants).
 */
export type CombatItemEffect =
  | { kind: 'heal_hp'; value: number }
  | { kind: 'heal_mp'; value: number }
  | { kind: 'heal_percentage'; percentage: number }
  | { kind: 'damage'; value: number }
  | { kind: 'buff'; stat: StatName; value: number; turns: number }
  | { kind: 'debuff'; stat: StatName; value: number; turns: number }
  | { kind: 'cure_status' };

/**
 * Effects applied by the backend to the save state (outside the battle
 * engine, which only sees the two active combatants).
 */
export type StateItemEffect =
  | { kind: 'revive_party'; percentage: number }
  | { kind: 'grant_currency'; value: number };

export type ItemEffectSpec = CombatItemEffect | StateItemEffect;

export interface ItemData {
  id: string;
  name: string;
  /** Optional hand-written description; derived from `effects` when omitted. */
  description?: string;
  type: ItemType;
  effects: ItemEffectSpec[];
  /** Weight in the dungeon treasure pool. 0/undefined = never drops. */
  dropWeight?: number;
  /** Icon file under game/public/assets/sprites/items/ (without extension). */
  icon?: string;
}

const potion_small: ItemData = {
  id: 'potion_small',
  name: 'Small Potion',
  type: ItemType.Consumable,
  effects: [{ kind: 'heal_hp', value: 30 }],
  dropWeight: 10,
  icon: 'potion_small',
};

const potion_medium: ItemData = {
  id: 'potion_medium',
  name: 'Medium Potion',
  type: ItemType.Consumable,
  effects: [{ kind: 'heal_hp', value: 60 }],
  dropWeight: 5,
  icon: 'potion_medium',
};

const ether_small: ItemData = {
  id: 'ether_small',
  name: 'Small Ether',
  type: ItemType.Consumable,
  effects: [{ kind: 'heal_mp', value: 20 }],
  dropWeight: 3,
  icon: 'ether_small',
};

const ether_large: ItemData = {
  id: 'ether_large',
  name: 'Large Ether',
  type: ItemType.Consumable,
  effects: [{ kind: 'heal_mp', value: 45 }],
  dropWeight: 1,
  icon: 'ether_large',
};

const elixir: ItemData = {
  id: 'elixir',
  name: 'Elixir',
  type: ItemType.Consumable,
  effects: [{ kind: 'heal_hp', value: 40 }, { kind: 'heal_mp', value: 25 }],
  dropWeight: 1,
  icon: 'elixir',
};

const tonic: ItemData = {
  id: 'tonic',
  name: 'Tonic',
  type: ItemType.Consumable,
  effects: [{ kind: 'cure_status' }],
  dropWeight: 2,
  icon: 'tonic',
};

const fire_bomb: ItemData = {
  id: 'fire_bomb',
  name: 'Fire Bomb',
  type: ItemType.Consumable,
  effects: [{ kind: 'damage', value: 25 }],
  dropWeight: 2,
  icon: 'fire_bomb',
};

const frost_bomb: ItemData = {
  id: 'frost_bomb',
  name: 'Frost Bomb',
  type: ItemType.Consumable,
  effects: [
    { kind: 'damage', value: 15 },
    // Status values are multipliers (see getEffectiveStat): 0.7 = -30% Speed.
    { kind: 'debuff', stat: StatName.Speed, value: 0.7, turns: 2 },
  ],
  dropWeight: 1,
  icon: 'frost_bomb',
};

const phoenix_feather: ItemData = {
  id: 'phoenix_feather',
  name: 'Phoenix Feather',
  type: ItemType.Consumable,
  effects: [{ kind: 'revive_party', percentage: 50 }],
  dropWeight: 1,
  icon: 'phoenix_feather',
};

const lucky_coin: ItemData = {
  id: 'lucky_coin',
  name: 'Lucky Coin',
  type: ItemType.Consumable,
  effects: [{ kind: 'grant_currency', value: 50 }],
  icon: 'lucky_coin',
};

export const ITEMS: Record<string, ItemData> = {
  potion_small,
  potion_medium,
  ether_small,
  ether_large,
  elixir,
  tonic,
  fire_bomb,
  frost_bomb,
  phoenix_feather,
  lucky_coin,
};

export function getItem(id: string): ItemData | undefined {
  return ITEMS[id];
}

export const STAT_LABELS: Record<StatName, string> = {
  [StatName.Attack]: 'Attack',
  [StatName.Defense]: 'Defense',
  [StatName.Arcane]: 'Arcane',
  [StatName.Speed]: 'Speed',
  [StatName.Hp]: 'HP',
};

function describeEffect(effect: ItemEffectSpec): string {
  switch (effect.kind) {
    case 'heal_hp':
      return `Restores ${effect.value} HP`;
    case 'heal_mp':
      return `Restores ${effect.value} MP`;
    case 'heal_percentage':
      return `Restores ${effect.percentage}% HP`;
    case 'damage':
      return `Deals ${effect.value} damage to the enemy`;
    case 'buff':
      return `+${Math.round((effect.value - 1) * 100)}% ${STAT_LABELS[effect.stat]} for ${effect.turns} turn${effect.turns === 1 ? '' : 's'}`;
    case 'debuff':
      return `-${Math.round((1 - effect.value) * 100)}% enemy ${STAT_LABELS[effect.stat]} for ${effect.turns} turn${effect.turns === 1 ? '' : 's'}`;
    case 'cure_status':
      return 'Cures status ailments';
    case 'revive_party':
      return `Revives fainted party members at ${effect.percentage}% HP`;
    case 'grant_currency':
      return `Gain ${effect.value} currency`;
  }
}

/** Derives the description from `effects`; returns the hand-written override when present. */
export function describeItem(item: ItemData): string {
  return item.description ?? item.effects.map(describeEffect).join(', ');
}
