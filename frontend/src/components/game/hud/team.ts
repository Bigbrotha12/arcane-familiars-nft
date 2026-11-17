// Pure view-model for the read-only Team modal: turns a world-map roster entry
// into the stats, ability rows and passive tiers the modal renders. All rules
// and texts come from @arcane-familiars/game-logic; nothing is duplicated here.

import {
  Affinity,
  BALANCE,
  FAMILIARS,
  PASSIVES,
  abilitiesAtLevel,
  applyCharm,
  getAbility,
  learnSchedule,
  passiveDescription,
  passiveTier,
  scaleFamiliarStats,
  xpToNextLevel,
} from '@arcane-familiars/game-logic';
import type { PassiveTier } from '@arcane-familiars/game-logic';
import type { RosterEntry } from '@/game';

export type TeamStatKey = 'hp' | 'mp' | 'attack' | 'defense' | 'arcane' | 'speed';

export interface TeamStatRow {
  key: TeamStatKey;
  label: string;
  /** Level-scaled value with the equipped charm applied. */
  value: number;
  /** Difference the charm makes (0 when there is no charm / no change). */
  bonus: number;
}

export interface TeamAbilityRow {
  id: string;
  name: string;
  mpCost: number;
  cooldown: number;
  description: string;
  learned: boolean;
  /** Level the entry unlocks at, from `learnSchedule`. */
  unlockLevel: number;
  /** A base entry replaced by its Rank-II variant at the rank-up level. */
  replaced: boolean;
}

export interface TeamPassiveTierRow {
  tier: 1 | 2 | 3 | 4;
  level: number;
  description: string;
  unlocked: boolean;
  current: boolean;
}

export interface TeamPassiveView {
  id: string;
  name: string;
  /** Current tier, 0 when the passive is still locked. */
  tier: PassiveTier;
  tiers: TeamPassiveTierRow[];
}

export interface TeamEntry {
  id: string;
  name: string;
  affinity?: string;
  level: number;
  xp: number;
  xpToNext: number;
  inParty: boolean;
  stats: TeamStatRow[];
  charm?: { name: string; modsLabel: string };
  abilities: TeamAbilityRow[];
  passive?: TeamPassiveView;
}

const STAT_ROWS: { key: TeamStatKey; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'mp', label: 'MP' },
  { key: 'attack', label: 'ATK' },
  { key: 'defense', label: 'DEF' },
  { key: 'arcane', label: 'ARC' },
  { key: 'speed', label: 'SPD' },
];

/** `whiteDog` -> `White Dog`, for a species missing from the local codex. */
function humanizeId(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function buildTeamEntry(rosterEntry: RosterEntry): TeamEntry {
  const species = FAMILIARS[rosterEntry.id];
  const level = Math.max(1, Math.floor(rosterEntry.level));
  const xp = Math.max(0, Math.floor(rosterEntry.xp));

  if (!species) {
    return {
      id: rosterEntry.id,
      name: humanizeId(rosterEntry.id),
      level,
      xp,
      xpToNext: xpToNextLevel(level),
      inParty: rosterEntry.inParty,
      stats: STAT_ROWS.map(({ key, label }) => ({ key, label, value: 0, bonus: 0 })),
      abilities: [],
    };
  }

  const scaled = scaleFamiliarStats(species.stats, level);
  const charmed = applyCharm(scaled, rosterEntry.charm);
  const stats = STAT_ROWS.map(({ key, label }) => ({
    key,
    label,
    value: charmed[key],
    bonus: charmed[key] - scaled[key],
  }));

  const learned = new Set(abilitiesAtLevel(species, level));
  const rankUpLevel = BALANCE.learnLevels.rankUp;
  const abilities = learnSchedule(species).map((entry): TeamAbilityRow => {
    const ability = getAbility(entry.abilityId);
    const isLearned = learned.has(entry.abilityId);
    return {
      id: entry.abilityId,
      name: ability?.name ?? entry.abilityId,
      mpCost: ability?.mpCost ?? 0,
      cooldown: ability?.cooldown ?? 0,
      description: ability?.description ?? '',
      learned: isLearned,
      unlockLevel: entry.level,
      // At the rank-up level the base entries are no longer in the usable
      // list; they were upgraded rather than unlearned.
      replaced: !isLearned && entry.level < rankUpLevel && level >= rankUpLevel,
    };
  });

  const currentTier = passiveTier(level);
  const passiveData = species.passive ? PASSIVES[species.passive] : undefined;
  const passive: TeamPassiveView | undefined = passiveData
    ? {
        id: passiveData.id,
        name: passiveData.name,
        tier: currentTier,
        tiers: BALANCE.passiveTierLevels.map((unlock, index) => {
          const tier = (index + 1) as 1 | 2 | 3 | 4;
          return {
            tier,
            level: unlock,
            description: passiveDescription(passiveData, tier),
            unlocked: currentTier >= tier,
            current: currentTier === tier,
          };
        }),
      }
    : undefined;

  return {
    id: rosterEntry.id,
    name: species.name,
    affinity: Affinity[species.affinity],
    level,
    xp,
    xpToNext: xpToNextLevel(level),
    inParty: rosterEntry.inParty,
    stats,
    ...(rosterEntry.charm ? { charm: { name: rosterEntry.charm.name, modsLabel: rosterEntry.charm.modsLabel } } : {}),
    abilities,
    ...(passive ? { passive } : {}),
  };
}

/** Party members first, then highest level; id keeps the order stable. */
export function sortRoster(roster: RosterEntry[]): RosterEntry[] {
  return [...roster].sort(
    (a, b) => Number(b.inParty) - Number(a.inParty) || b.level - a.level || a.id.localeCompare(b.id)
  );
}
