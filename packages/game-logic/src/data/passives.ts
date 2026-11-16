/**
 * Party passives: one per non-boss species, unlocked at Lv 5 and strengthened
 * at Lv 10 / 15 / 20 (see `BALANCE.passiveTierLevels`).
 *
 * `description` is a template: `{pct}` is replaced with the tier value as a
 * percentage (0.25 -> 25) and `{value}` with the raw tier value. UI code should
 * use `passiveDescription()` rather than reading `description` directly.
 */
export type PassiveId =
  | 'kindling'
  | 'tailwind'
  | 'tidecaller'
  | 'bedrock'
  | 'radiance'
  | 'umbralHunger'
  | 'battleCry'
  | 'manaSpring'
  | 'secondWind'
  | 'relayInstinct';

export interface PassiveData {
  id: PassiveId;
  name: string;
  /** Template string; see the module comment. */
  description: string;
  /** Numeric value per tier I..IV (meaning documented per passive). */
  tiers: [number, number, number, number];
  /** Base ability ids this passive boosts (for UI hints). */
  combosWith: string[];
}

/** A passive currently in effect for the party. */
export interface ActivePassive {
  id: PassiveId;
  tier: 1 | 2 | 3 | 4;
  value: number;
  sourceFamiliarId: string;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export const PASSIVES: Record<PassiveId, PassiveData> = {
  kindling: {
    id: 'kindling',
    name: 'Kindling',
    description: 'DoT damage +{pct}%',
    tiers: [0.25, 0.35, 0.45, 0.6],
    combosWith: ['flameLash', 'hex', 'inferno', 'soulRend'],
  },
  tailwind: {
    id: 'tailwind',
    name: 'Tailwind',
    description: '+{pct}% speed',
    tiers: [0.06, 0.09, 0.12, 0.15],
    combosWith: ['quickstep', 'windWard', 'galeEdge'],
  },
  tidecaller: {
    id: 'tidecaller',
    name: 'Tidecaller',
    description: 'Heals and HoTs restore +{pct}%',
    tiers: [0.15, 0.22, 0.3, 0.4],
    combosWith: ['healpulse', 'purify', 'naturabless'],
  },
  bedrock: {
    id: 'bedrock',
    name: 'Bedrock',
    description: 'While Defending, incoming direct damage ×{value}',
    tiers: [0.42, 0.38, 0.34, 0.3],
    combosWith: ['sturdy', 'thornCoat', 'runeShield', 'glacialWard', 'magmaArmor'],
  },
  radiance: {
    id: 'radiance',
    name: 'Radiance',
    description: 'Regain {pct}% max HP at the end of each turn',
    tiers: [0.02, 0.03, 0.04, 0.05],
    combosWith: [],
  },
  umbralHunger: {
    id: 'umbralHunger',
    name: 'Umbral Hunger',
    description: '+{pct}% damage against afflicted enemies',
    tiers: [0.1, 0.15, 0.2, 0.25],
    combosWith: [
      'rootSnare',
      'frostbite',
      'nightTerror',
      'shadowstrike',
      'hex',
      'siphon',
      'lifedrain',
      'tidalCrash',
      'quake',
      'sunburst',
    ],
  },
  battleCry: {
    id: 'battleCry',
    name: 'Battle Cry',
    description: 'Attack-scaling abilities deal +{pct}%',
    tiers: [0.08, 0.12, 0.16, 0.2],
    combosWith: ['brave', 'ironbash', 'flameLash', 'quake', 'galeEdge'],
  },
  manaSpring: {
    id: 'manaSpring',
    name: 'Mana Spring',
    description: 'Basic attacks restore {pct}% max MP',
    tiers: [0.08, 0.1, 0.12, 0.15],
    combosWith: ['fireball', 'frozenTide', 'inferno'],
  },
  secondWind: {
    id: 'secondWind',
    name: 'Second Wind',
    description: 'Once per battle, heal {pct}% max HP when dropping below 30%',
    tiers: [0.1, 0.14, 0.18, 0.22],
    combosWith: ['brave'],
  },
  relayInstinct: {
    id: 'relayInstinct',
    name: 'Relay Instinct',
    description: 'Next ability after swapping in costs {pct}% less MP',
    tiers: [0.4, 0.6, 0.8, 1],
    combosWith: [],
  },
};

/** Resolve a passive's description template for a given tier. */
export function passiveDescription(passive: PassiveData, tier: 1 | 2 | 3 | 4): string {
  const value = passive.tiers[tier - 1];
  return passive.description
    .split('{pct}')
    .join(String(Math.round(value * 100)))
    .split('{value}')
    .join(formatNumber(value));
}
