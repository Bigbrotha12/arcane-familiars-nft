import { Affinity, FAMILIARS, Rarity } from '@arcane-familiars/game-logic';
import type { CatalogFamiliar } from '@/lib/collection';

export interface FamiliarStats {
  hp: number;
  mp: number;
  attack: number;
  defense: number;
  arcane: number;
  speed: number;
}

/** A single card in the collection grid, normalized across both data sources. */
export interface CollectionEntry {
  id: string;
  name: string;
  description: string;
  rarity: string;
  affinity?: string;
  image?: string;
  stats: FamiliarStats;
}

const EMPTY_STATS: FamiliarStats = { hp: 0, mp: 0, attack: 0, defense: 0, arcane: 0, speed: 0 };

/** `whiteDog` -> `White Dog` (used when a species id has no local metadata). */
function humanizeId(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The per-species portrait lives in the frontend's own public assets
 * (`frontend/public/assets/sprites/familiars/<id>/<id>_portrait.png`), so it is
 * reachable from the SPA bundle. A missing file falls back to the card's styled
 * placeholder via `onError`.
 */
export function portraitPath(id: string): string {
  return `/assets/sprites/familiars/${id}/${id}_portrait.png`;
}

/** Map a D1 catalog row (`GET /api/collection`) into a display entry. */
export function catalogEntry(row: CatalogFamiliar): CollectionEntry {
  return {
    id: `catalog-${row.familiar_id}`,
    name: row.name,
    description: row.description,
    rarity: row.rarity,
    affinity: row.affinity,
    image: row.image,
    stats: {
      hp: row.hp,
      mp: row.mp,
      attack: row.attack,
      defense: row.defense,
      arcane: row.arcane,
      speed: row.speed,
    },
  };
}

/**
 * Map an owned species id (`GET /api/game/owned-familiars`) into a display entry
 * using the local game-logic metadata, which is the authoritative source for
 * name/stats/rarity/affinity. Unknown ids still render (with the styled
 * placeholder) so a newly added species never silently disappears from a
 * player's collection.
 */
export function speciesEntry(id: string): CollectionEntry {
  const data = FAMILIARS[id];

  if (!data) {
    return {
      id,
      name: humanizeId(id),
      description: '',
      rarity: 'common',
      image: portraitPath(id),
      stats: { ...EMPTY_STATS },
    };
  }

  return {
    id,
    name: data.name,
    description: data.description,
    rarity: Rarity[data.rarity],
    affinity: Affinity[data.affinity],
    image: portraitPath(id),
    stats: {
      hp: data.stats.hp,
      mp: data.stats.mp,
      attack: data.stats.attack,
      defense: data.stats.defense,
      arcane: data.stats.arcane,
      speed: data.stats.speed,
    },
  };
}
