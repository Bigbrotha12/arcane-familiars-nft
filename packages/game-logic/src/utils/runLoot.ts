import type { DungeonState } from '@/types/exploration';
import type { GameState, Inventory, InventoryItem } from '@/types/gameState';
import type { CharmInstance } from '@/data/charms';
import { CHARM_SALVAGE, MAX_CHARMS } from '@/utils/charms';

export interface RunLootSummary extends Inventory {
  /** Charms found in the run. */
  charms?: CharmInstance[];
  /** Charms auto-salvaged because the collection was already at MAX_CHARMS. */
  salvagedCharms?: CharmInstance[];
  /** Coins credited by that auto-salvage. */
  salvageCurrency?: number;
}

function cloneCharms(charms: CharmInstance[] | undefined): CharmInstance[] {
  return (charms ?? []).map((charm) => ({ ...charm, mods: charm.mods.map((mod) => ({ ...mod })) }));
}

export function emptyInventory(): Inventory {
  return { currency: 0, items: [] };
}

/**
 * Loot found during a run. Older saves predate the field, so it is created
 * lazily. Once the run ends, this is either banked (exit/victory) or discarded
 * (defeat).
 */
export function getRunLoot(dungeon: DungeonState | null | undefined): Inventory {
  if (!dungeon) return emptyInventory();
  if (!dungeon.runLoot) dungeon.runLoot = emptyInventory();
  return dungeon.runLoot;
}

export function addInventoryItem(inventory: Inventory, itemId: string, quantity = 1): void {
  const existing = inventory.items.find((item) => item.itemId === itemId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    inventory.items.push({ itemId, quantity });
  }
}

export function mergeInventory(target: Inventory, source: Inventory): void {
  target.currency += source.currency;
  for (const item of source.items) {
    addInventoryItem(target, item.itemId, item.quantity);
  }
}

/** Move all run loot into the bank and clear the run ledger. */
export function bankRunLoot(state: GameState): RunLootSummary {
  const loot = getRunLoot(state.dungeon);
  const charms = cloneCharms(state.dungeon?.runCharms);
  const banked: RunLootSummary = {
    currency: loot.currency,
    items: loot.items.map((item) => ({ ...item })),
    ...(charms.length > 0 ? { charms } : {}),
  };
  mergeInventory(state.inventory, loot);

  // Charms bank into their own shelf. Once it is full, extra charms are
  // auto-salvaged instead of being silently dropped.
  state.charms ??= [];
  const salvaged: CharmInstance[] = [];
  let salvageCurrency = 0;
  for (const charm of charms) {
    if (state.charms.length >= MAX_CHARMS) {
      salvaged.push(charm);
      salvageCurrency += CHARM_SALVAGE[charm.rarity];
    } else {
      state.charms.push(charm);
    }
  }
  if (salvageCurrency > 0) {
    state.inventory.currency += salvageCurrency;
    banked.salvagedCharms = salvaged;
    banked.salvageCurrency = salvageCurrency;
  }

  if (state.dungeon) {
    state.dungeon.runLoot = emptyInventory();
    state.dungeon.runCharms = [];
  }
  return banked;
}

/** Return and clear the run ledger without banking it (defeat). */
export function discardRunLoot(state: GameState): RunLootSummary {
  const loot = getRunLoot(state.dungeon);
  const charms = cloneCharms(state.dungeon?.runCharms);
  const lost: RunLootSummary = {
    currency: loot.currency,
    items: loot.items.map((item) => ({ ...item })),
    ...(charms.length > 0 ? { charms } : {}),
  };
  if (state.dungeon) {
    state.dungeon.runLoot = emptyInventory();
    state.dungeon.runCharms = [];
  }
  return lost;
}

/** Find an item in run loot or the bank. Run loot is consumed first. */
export function findOwnedItem(
  state: GameState,
  itemId: string
): { item: InventoryItem; source: 'run' | 'bank' } | null {
  const runItem = getRunLoot(state.dungeon).items.find((item) => item.itemId === itemId && item.quantity > 0);
  if (runItem) return { item: runItem, source: 'run' };
  const bankItem = state.inventory.items.find((item) => item.itemId === itemId && item.quantity > 0);
  if (bankItem) return { item: bankItem, source: 'bank' };
  return null;
}

export function consumeOwnedItem(
  state: GameState,
  itemId: string
): { item: InventoryItem; source: 'run' | 'bank' } | null {
  const owned = findOwnedItem(state, itemId);
  if (!owned) return null;
  owned.item.quantity -= 1;
  return owned;
}
