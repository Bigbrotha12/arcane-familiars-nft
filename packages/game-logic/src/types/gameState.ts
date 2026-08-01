import type { DungeonState } from '@/types/exploration';

export interface Inventory {
  currency: number;
  items: InventoryItem[];
}

export interface InventoryItem {
  itemId: string;
  quantity: number;
}

export interface GameState {
  version: number;
  id: string;
  anonymousId: string;
  playerFamiliars: string[];
  activeParty: string[];
  inventory: Inventory;
  dungeon: DungeonState | null;
  unlockedAreas: string[];
  defeatedBosses: string[];
  battleCount: number;
  winCount: number;
  lastSaved: number;
}

