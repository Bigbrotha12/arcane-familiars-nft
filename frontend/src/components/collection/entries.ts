import {
  Affinity,
  FAMILIARS,
  PASSIVES,
  Rarity,
  getAbility,
  learnSchedule,
  passiveDescription,
} from '@arcane-familiars/game-logic';
import type { FamiliarData } from '@arcane-familiars/game-logic';

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
  /** Compact learn schedule, e.g. "Lv 1 Brave · Lv 3 Sturdy · Lv 9 Sunburst · Lv 12 Rank II". */
  learnset?: string;
  /** Party passive summary, when the species has one. */
  passive?: { name: string; description: string; maxDescription: string };
}

const EMPTY_STATS: FamiliarStats = { hp: 0, mp: 0, attack: 0, defense: 0, arcane: 0, speed: 0 };

/** `whiteDog` -> `White Dog` (used when a species id has no local metadata). */
function humanizeId(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Group a species' unlocks into one compact "Lv n A / B" segment per level. */
export function learnsetLabel(species: FamiliarData): string {
  const groups: { level: number; names: string[] }[] = [];
  for (const entry of learnSchedule(species)) {
    const name = entry.abilityId.endsWith('_2') ? 'Rank II' : (getAbility(entry.abilityId)?.name ?? entry.abilityId);
    const group = groups.find((g) => g.level === entry.level);
    if (group) {
      if (!group.names.includes(name)) group.names.push(name);
    } else {
      groups.push({ level: entry.level, names: [name] });
    }
  }
  return groups.map((group) => `Lv ${group.level} ${group.names.join(' / ')}`).join(' · ');
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

/** Species passive summary for the codex card (tier I and tier IV text). */
function passiveSummary(species?: FamiliarData): CollectionEntry['passive'] {
  if (!species?.passive) return undefined;
  const passive = PASSIVES[species.passive];
  return {
    name: passive.name,
    description: passiveDescription(passive, 1),
    maxDescription: passiveDescription(passive, 4),
  };
}

/**
 * Map an in-game familiar species id into a display entry
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
    learnset: learnsetLabel(data),
    passive: passiveSummary(data),
  };
}
