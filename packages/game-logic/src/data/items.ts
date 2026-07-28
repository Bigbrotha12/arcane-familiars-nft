export interface ItemData {
  id: string;
  name: string;
  description: string;
  type: 'consumable';
  effect: { type: 'heal_hp' | 'heal_mp'; value: number };
}

export const ITEMS: Record<string, ItemData> = {
  potion_small: {
    id: 'potion_small',
    name: 'Small Potion',
    description: 'Restore 30 HP',
    type: 'consumable',
    effect: { type: 'heal_hp', value: 30 },
  },
  potion_medium: {
    id: 'potion_medium',
    name: 'Medium Potion',
    description: 'Restore 60 HP',
    type: 'consumable',
    effect: { type: 'heal_hp', value: 60 },
  },
  ether_small: {
    id: 'ether_small',
    name: 'Small Ether',
    description: 'Restore 20 MP',
    type: 'consumable',
    effect: { type: 'heal_mp', value: 20 },
  },
};
