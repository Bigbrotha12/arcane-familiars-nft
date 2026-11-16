import type { CharmInstance } from '@/data/charms';
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
  /** Per-species progression. Missing entries mean level 1 / 0 XP. */
  familiarLevels?: Record<string, number>;
  familiarXp?: Record<string, number>;
  /** Per-species wins against it while unowned; optional so old saves load. */
  recruitBond?: Record<string, number>;
  inventory: Inventory;
  /** Owned charms, equipped ones included. Optional so old saves still load. */
  charms?: CharmInstance[];
  dungeon: DungeonState | null;
  unlockedAreas: string[];
  defeatedBosses: string[];
  battleCount: number;
  winCount: number;
  /** Number of battles completed (won or lost) today, for the daily battle cap. */
  battlesToday?: number;
  /** UTC calendar day (YYYY-MM-DD) the battlesToday counter applies to. */
  battlesDayUtc?: string;
  lastSaved: number;
}
