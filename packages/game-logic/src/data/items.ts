export enum ItemType {
  Consumable,
  Equipment
}

export enum ItemEffect {
  HP_HEAL,
  MP_HEAL
}

export interface ItemData {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  effect: {
    type: ItemEffect
    value: number
  };
}

const potion_small: ItemData = {
  id: 'potion_small',
  name: 'Small Potion',
  description: 'Restore 30 HP',
  type: ItemType.Consumable,
  effect: {
    type: ItemEffect.HP_HEAL,
    value: 30
  }
};

const potion_medium: ItemData = {
  id: 'potion_medium',
  name: 'Medium Potion',
  description: 'Restore 60 HP',
  type: ItemType.Consumable,
  effect: {
    type: ItemEffect.HP_HEAL,
    value: 60
  },
};

const ether_small: ItemData = {
  id: 'ether_small',
  name: 'Small Ether',
  description: 'Restore 20 MP',
  type: ItemType.Consumable,
  effect: {
    type: ItemEffect.MP_HEAL,
    value: 20
  },
}

export const ITEMS: Record<string, ItemData> = {
  potion_small,
  potion_medium,
  ether_small
};

export function getItem(id: string): ItemData | undefined {
  return ITEMS[id];
}
