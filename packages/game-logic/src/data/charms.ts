import type { ItemRarity } from '@/data/items';

/**
 * Charms are one-per-familiar equipment that rolls percentage modifiers to a
 * familiar's combat stats. They deliberately never touch HP/MP: dungeon HP
 * tracking stays exactly as it was before charms existed.
 */
export type CharmStat = 'attack' | 'defense' | 'arcane' | 'speed';

/** Same rarity bands as items; aliased so the client can reuse rarity colours. */
export type CharmRarity = ItemRarity;

export interface CharmMod {
  stat: CharmStat;
  /** Integer percent: 7 = +7%. */
  pct: number;
}

export interface CharmRoll {
  baseId: string;
  rarity: CharmRarity;
  mods: CharmMod[];
}

/** A rolled charm the player owns. `equippedTo` is a familiar species id. */
export interface CharmInstance extends CharmRoll {
  uid: string;
  equippedTo?: string;
}

export interface CharmBase {
  id: string;
  name: string;
  /** The first mod is always this stat. */
  primary: CharmStat;
}

export const CHARM_BASES: CharmBase[] = [
  { id: 'emberBand', name: 'Ember Band', primary: 'attack' },
  { id: 'stoneLocket', name: 'Stone Locket', primary: 'defense' },
  { id: 'moonPendant', name: 'Moon Pendant', primary: 'arcane' },
  { id: 'featherAnklet', name: 'Feather Anklet', primary: 'speed' },
];

export const CHARM_BASE_BY_ID: Record<string, CharmBase> = Object.fromEntries(
  CHARM_BASES.map((base) => [base.id, base])
);

export const CHARM_STATS: CharmStat[] = ['attack', 'defense', 'arcane', 'speed'];

export const CHARM_STAT_LABELS: Record<CharmStat, string> = {
  attack: 'Attack',
  defense: 'Defense',
  arcane: 'Arcane',
  speed: 'Speed',
};

/** The "of …" suffix uses the second mod's stat. */
export const CHARM_SECOND_NAMES: Record<CharmStat, string> = {
  attack: 'Might',
  defense: 'Stone',
  arcane: 'Stars',
  speed: 'Wind',
};
