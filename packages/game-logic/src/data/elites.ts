import type { FamiliarData } from '@/data/familiars';

/**
 * Elite affixes. An elite is a normal encounter with exactly one affix: a
 * tougher fight that pays out a rare chest. Kept as data so future clients can
 * label an elite without the engine hard-coding names.
 */
export type EliteId = 'armored' | 'hulking' | 'swift' | 'vampiric' | 'volatile';

export interface EliteAffix {
  id: EliteId;
  /** Prepended to the familiar's display name ("Armored White Dog"). */
  prefix: string;
  description: string;
}

export const ELITES: Record<EliteId, EliteAffix> = {
  armored: { id: 'armored', prefix: 'Armored', description: 'Defense ×1.5' },
  hulking: { id: 'hulking', prefix: 'Hulking', description: 'Max HP ×1.6' },
  swift: { id: 'swift', prefix: 'Swift', description: 'Speed ×1.5' },
  vampiric: { id: 'vampiric', prefix: 'Vampiric', description: 'Heals 30% of direct damage dealt' },
  volatile: { id: 'volatile', prefix: 'Volatile', description: 'Gathers power every few turns' },
};

export const ELITE_IDS = Object.keys(ELITES) as EliteId[];

/** Display name of an elite of the given species. */
export function eliteName(baseName: string, eliteId: EliteId): string {
  return `${ELITES[eliteId].prefix} ${baseName}`;
}

/**
 * Apply an affix to an already level-scaled familiar. Pure: returns a new
 * FamiliarData and never mutates the input. The species id is untouched so
 * rewards, recruits and persisted encounters keep referring to the species.
 */
export function applyElite(familiarData: FamiliarData, eliteId: EliteId): FamiliarData {
  const stats = { ...familiarData.stats };

  switch (eliteId) {
    case 'armored':
      stats.defense = Math.round(stats.defense * 1.5);
      break;
    case 'hulking': {
      const hp = Math.round(stats.maxHp * 1.6);
      stats.hp = hp;
      stats.maxHp = hp;
      break;
    }
    case 'swift':
      stats.speed = Math.round(stats.speed * 1.5);
      break;
    case 'vampiric':
    case 'volatile':
      // Mechanical affixes: handled by the engine, no stat change.
      break;
  }

  return {
    ...familiarData,
    name: eliteName(familiarData.name, eliteId),
    stats,
  };
}
