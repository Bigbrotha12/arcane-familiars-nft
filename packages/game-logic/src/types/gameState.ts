import type { DungeonState } from '@/types/exploration';
import type { BattleState } from '@/types/battle';

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
  /** Authoritative active battle. Stored in the save document so the battle
   *  turn and the player state commit in one row write. */
  activeBattle: BattleState | null;
  unlockedAreas: string[];
  defeatedBosses: string[];
  battleCount: number;
  winCount: number;
  lastSaved: number;
}

