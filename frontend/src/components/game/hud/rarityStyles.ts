// Item rarity colours from DESIGN.md: common = muted text, uncommon = teal,
// rare = the pink accent used for highlights. Shared by the treasure overlay
// and the boss-chest block so both read the same way.

import type { ItemRarity } from '@arcane-familiars/game-logic';

export const RARITY_TEXT_CLASS: Record<ItemRarity, string> = {
  common: 'text-[#A5A3C4]',
  uncommon: 'text-teal',
  rare: 'text-pink',
};
