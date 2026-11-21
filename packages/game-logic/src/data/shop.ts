export interface ShopEntry {
  itemId: string;
  price: number;
}

/** Consumables available at the world-map shop. */
export const SHOP_STOCK: ShopEntry[] = [
  { itemId: 'potion_small', price: 25 },
  { itemId: 'potion_medium', price: 60 },
  { itemId: 'ether_small', price: 40 },
  { itemId: 'ether_large', price: 90 },
  { itemId: 'potion_large', price: 130 },
  { itemId: 'phoenix_feather', price: 220 },
];

export function getShopEntry(itemId: string): ShopEntry | undefined {
  return SHOP_STOCK.find((entry) => entry.itemId === itemId);
}
