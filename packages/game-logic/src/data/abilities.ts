import { Affinity } from '@/data/familiars';

export enum EffectType {
  Damage,
  Heal,
  Buff,
  Debuff,
  Dot,
  Hot,
  MpHeal,
}

export enum StatName {
  Attack,
  Defense,
  Arcane,
  Speed,
  Hp,
}

export enum Target {
  Enemy,
  Self,
  Ally,
}

export enum ScalingStat {
  None,
  Attack,
  Arcane,
}

export interface AbilityData {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  target: Target;
  effectType: EffectType;
  multiplier: number;
  cooldown: number;
  scalingStat: ScalingStat;
  /**
   * Extra attack-damage multiplier that scales with the user's missing HP:
   * effective = multiplier + lowHpBonus * (1 - currentHp / maxHp).
   */
  lowHpBonus?: number;
  statusEffect?: {
    type: EffectType;
    stat: StatName;
    value: number;
    duration: number;
  };
}

const brave: AbilityData = {
  id: 'brave',
  name: 'Brave',
  description: 'Strike harder the more hurt you are: 1.3x attack damage, up to 2.2x near defeat',
  mpCost: 8,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Attack,
  multiplier: 1.3,
  lowHpBonus: 0.9,
  cooldown: 1,
};

const sturdy: AbilityData = {
  id: 'sturdy',
  name: 'Sturdy',
  description: 'Buff defense by 1.5x for 2 turns',
  mpCost: 8,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.5,
  cooldown: 3,
  statusEffect: {
    type: EffectType.Buff,
    stat: StatName.Defense,
    value: 1.5,
    duration: 2,
  },
};

const fireball: AbilityData = {
  id: 'fireball',
  name: 'Fireball',
  description: 'A blazing projectile dealing 2.0x arcane damage',
  mpCost: 15,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 2.0,
  cooldown: 2,
};

const quickstep: AbilityData = {
  id: 'quickstep',
  name: 'Quickstep',
  description: 'Buff speed by 1.5x for 2 turns',
  mpCost: 8,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Attack,
  multiplier: 1.5,
  cooldown: 2,
  statusEffect: {
    type: EffectType.Buff,
    stat: StatName.Speed,
    value: 1.5,
    duration: 2,
  },
};

const healpulse: AbilityData = {
  id: 'healpulse',
  name: 'Heal Pulse',
  description: 'Restore 30% of ally max HP',
  mpCost: 12,
  target: Target.Ally,
  effectType: EffectType.Heal,
  scalingStat: ScalingStat.Arcane,
  multiplier: 0.3,
  cooldown: 3,
};

const shadowstrike: AbilityData = {
  id: 'shadowstrike',
  name: 'Shadow Strike',
  description: 'Deal 1.2x damage and reduce target defense by 0.8x for 2 turns',
  mpCost: 18,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.2,
  cooldown: 3,
  statusEffect: {
    type: EffectType.Debuff,
    stat: StatName.Defense,
    value: 0.8,
    duration: 2,
  },
};

const ironbash: AbilityData = {
  id: 'ironbash',
  name: 'Iron Bash',
  description: 'A heavy physical strike dealing 1.3x attack damage',
  mpCost: 12,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Attack,
  multiplier: 1.3,
  cooldown: 1,
};

const naturabless: AbilityData = {
  id: 'naturabless',
  name: 'Nature Bless',
  description: 'Restore 20% max HP and gain 5 HP HoT for 2 turns',
  mpCost: 10,
  target: Target.Self,
  effectType: EffectType.Heal,
  scalingStat: ScalingStat.Arcane,
  multiplier: 0.2,
  cooldown: 2,
  statusEffect: {
    type: EffectType.Hot,
    stat: StatName.Hp,
    value: 5,
    duration: 2,
  },
};

const flameLash: AbilityData = {
  id: 'flameLash',
  name: 'Flame Lash',
  description: 'Deal 1.3x attack damage and burn the target for 6 damage over 3 turns',
  mpCost: 14,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Attack,
  multiplier: 1.3,
  cooldown: 3,
  statusEffect: { type: EffectType.Dot, stat: StatName.Hp, value: 6, duration: 3 },
};

const cinderCloak: AbilityData = {
  id: 'cinderCloak',
  name: 'Cinder Cloak',
  description: 'Increase arcane power by 30% for 2 turns',
  mpCost: 10,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.3,
  cooldown: 3,
  statusEffect: { type: EffectType.Buff, stat: StatName.Arcane, value: 1.3, duration: 2 },
};

const magmaArmor: AbilityData = {
  id: 'magmaArmor',
  name: 'Magma Armor',
  description: 'Increase defense by 40% for 2 turns',
  mpCost: 12,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.4,
  cooldown: 3,
  statusEffect: { type: EffectType.Buff, stat: StatName.Defense, value: 1.4, duration: 2 },
};

const frostbite: AbilityData = {
  id: 'frostbite',
  name: 'Frostbite',
  description: 'Deal 1.2x arcane damage and reduce speed by 30% for 2 turns',
  mpCost: 14,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.2,
  cooldown: 2,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Speed, value: 0.7, duration: 2 },
};

const glacialWard: AbilityData = {
  id: 'glacialWard',
  name: 'Glacial Ward',
  description: 'Increase defense by 50% for 2 turns',
  mpCost: 12,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.5,
  cooldown: 3,
  statusEffect: { type: EffectType.Buff, stat: StatName.Defense, value: 1.5, duration: 2 },
};

const frozenTide: AbilityData = {
  id: 'frozenTide',
  name: 'Frozen Tide',
  description: 'Deal 1.4x arcane damage and slow the target for 1 turn',
  mpCost: 18,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.4,
  cooldown: 4,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Speed, value: 0.6, duration: 1 },
};

const thornCoat: AbilityData = {
  id: 'thornCoat',
  name: 'Thorn Coat',
  description: 'Increase defense by 30% for 2 turns',
  mpCost: 10,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.3,
  cooldown: 3,
  statusEffect: { type: EffectType.Buff, stat: StatName.Defense, value: 1.3, duration: 2 },
};

const rootSnare: AbilityData = {
  id: 'rootSnare',
  name: 'Root Snare',
  description: 'Reduce target speed by 35% for 2 turns',
  mpCost: 10,
  target: Target.Enemy,
  effectType: EffectType.Debuff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1,
  cooldown: 2,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Speed, value: 0.65, duration: 2 },
};

const nightTerror: AbilityData = {
  id: 'nightTerror',
  name: 'Night Terror',
  description: 'Deal 1.3x arcane damage and reduce attack by 20% for 2 turns',
  mpCost: 16,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.3,
  cooldown: 3,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Attack, value: 0.8, duration: 2 },
};

const lifedrain: AbilityData = {
  id: 'lifedrain',
  name: 'Life Drain',
  description: 'Deal 1.2x arcane damage and weaken the target',
  mpCost: 16,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.2,
  cooldown: 3,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Arcane, value: 0.8, duration: 2 },
};

const hex: AbilityData = {
  id: 'hex',
  name: 'Hex',
  description: 'Curse the target for 10 damage per turn for 3 turns',
  mpCost: 12,
  target: Target.Enemy,
  effectType: EffectType.Dot,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1,
  cooldown: 3,
  statusEffect: { type: EffectType.Dot, stat: StatName.Hp, value: 10, duration: 3 },
};

const siphon: AbilityData = {
  id: 'siphon',
  name: 'Siphon',
  description: 'Deal arcane damage and reduce the target arcane power',
  mpCost: 14,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1,
  cooldown: 3,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Arcane, value: 0.8, duration: 2 },
};

const runeShield: AbilityData = {
  id: 'runeShield',
  name: 'Rune Shield',
  description: 'Increase defense by 50% for 2 turns',
  mpCost: 12,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.5,
  cooldown: 3,
  statusEffect: { type: EffectType.Buff, stat: StatName.Defense, value: 1.5, duration: 2 },
};

const purify: AbilityData = {
  id: 'purify',
  name: 'Purify',
  description: 'Restore 15% max HP and gain 5 HP HoT for 2 turns',
  mpCost: 12,
  target: Target.Ally,
  effectType: EffectType.Heal,
  scalingStat: ScalingStat.Arcane,
  multiplier: 0.15,
  cooldown: 3,
  statusEffect: { type: EffectType.Hot, stat: StatName.Hp, value: 5, duration: 2 },
};

const thunderclap: AbilityData = {
  id: 'thunderclap',
  name: 'Thunderclap',
  description: 'Deal 1.1x arcane damage with a crack of thunder',
  mpCost: 16,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.1,
  cooldown: 2,
};

const windWard: AbilityData = {
  id: 'windWard',
  name: 'Wind Ward',
  description: 'Increase speed by 40% for 2 turns',
  mpCost: 10,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.4,
  cooldown: 3,
  statusEffect: { type: EffectType.Buff, stat: StatName.Speed, value: 1.4, duration: 2 },
};

const rally: AbilityData = {
  id: 'rally',
  name: 'Rally',
  description: 'Increase attack by 25% for 2 turns',
  mpCost: 10,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.25,
  cooldown: 3,
  statusEffect: { type: EffectType.Buff, stat: StatName.Attack, value: 1.25, duration: 2 },
};

const focus: AbilityData = {
  id: 'focus',
  name: 'Focus',
  description: 'Increase arcane power by 25% for 2 turns',
  mpCost: 10,
  target: Target.Self,
  effectType: EffectType.Buff,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.25,
  cooldown: 3,
  statusEffect: { type: EffectType.Buff, stat: StatName.Arcane, value: 1.25, duration: 2 },
};

// --- Affinity signature abilities (learned at the signature learn level) ---

const inferno: AbilityData = {
  id: 'inferno',
  name: 'Inferno',
  description: 'Deal 1.7x arcane damage and burn the target for 8 damage per turn for 3 turns',
  mpCost: 22,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.7,
  cooldown: 4,
  statusEffect: { type: EffectType.Dot, stat: StatName.Hp, value: 8, duration: 3 },
};

const tidalCrash: AbilityData = {
  id: 'tidalCrash',
  name: 'Tidal Crash',
  description: 'Deal 1.7x arcane damage and reduce target speed by 30% for 2 turns',
  mpCost: 20,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.7,
  cooldown: 4,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Speed, value: 0.7, duration: 2 },
};

const quake: AbilityData = {
  id: 'quake',
  name: 'Quake',
  description: 'Deal 1.7x attack damage and reduce target defense by 25% for 2 turns',
  mpCost: 20,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Attack,
  multiplier: 1.7,
  cooldown: 4,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Defense, value: 0.75, duration: 2 },
};

const galeEdge: AbilityData = {
  id: 'galeEdge',
  name: 'Gale Edge',
  description: 'A razor wind dealing 1.9x attack damage',
  mpCost: 18,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Attack,
  multiplier: 1.9,
  cooldown: 3,
};

const sunburst: AbilityData = {
  id: 'sunburst',
  name: 'Sunburst',
  description: 'Deal 1.6x arcane damage and reduce target attack by 20% for 2 turns',
  mpCost: 20,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.6,
  cooldown: 4,
  statusEffect: { type: EffectType.Debuff, stat: StatName.Attack, value: 0.8, duration: 2 },
};

const soulRend: AbilityData = {
  id: 'soulRend',
  name: 'Soul Rend',
  description: 'Deal 1.4x arcane damage and tear the target for 12 damage per turn for 3 turns',
  mpCost: 22,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Arcane,
  multiplier: 1.4,
  cooldown: 4,
  statusEffect: { type: EffectType.Dot, stat: StatName.Hp, value: 12, duration: 3 },
};

/** The signature ability every non-boss familiar of an affinity learns at the signature level. */
export const SIGNATURE_BY_AFFINITY: Record<Affinity, string> = {
  [Affinity.Fire]: inferno.id,
  [Affinity.Water]: tidalCrash.id,
  [Affinity.Earth]: quake.id,
  [Affinity.Wind]: galeEdge.id,
  [Affinity.Light]: sunburst.id,
  [Affinity.Dark]: soulRend.id,
};

// --- Base ability table ---

const BASE_ABILITIES: Record<string, AbilityData> = {
  brave,
  sturdy,
  fireball,
  quickstep,
  healpulse,
  shadowstrike,
  ironbash,
  naturabless,
  flameLash,
  cinderCloak,
  magmaArmor,
  frostbite,
  glacialWard,
  frozenTide,
  thornCoat,
  rootSnare,
  nightTerror,
  lifedrain,
  hex,
  siphon,
  runeShield,
  purify,
  thunderclap,
  windWard,
  rally,
  focus,
  inferno,
  tidalCrash,
  quake,
  galeEdge,
  sunburst,
  soulRend,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round2(value));
}

/** Replace a numeric value that carries a unit suffix ("1.5x", "2 turns", "30%"). */
function replaceValueText(text: string, from: number, to: number, suffix: string): string {
  const needle = `${formatNumber(from)}${suffix}`;
  if (needle === `${formatNumber(to)}${suffix}`) return text;
  return text.split(needle).join(`${formatNumber(to)}${suffix}`);
}

/**
 * Descriptions are hand-written prose, so a rank-II variant updates the numbers
 * the base text quotes and then marks itself. Anything that cannot be matched
 * still gets the "(Rank II)" suffix; the data is authoritative either way.
 */
function rankIIDescription(base: AbilityData, variant: AbilityData): string {
  let text = base.description;

  if (variant.multiplier !== base.multiplier) {
    text = replaceValueText(text, base.multiplier, variant.multiplier, 'x');
    text = replaceValueText(text, Math.round(base.multiplier * 100), Math.round(variant.multiplier * 100), '%');
    if (base.lowHpBonus) {
      text = replaceValueText(
        text,
        round2(base.multiplier + base.lowHpBonus),
        round2(variant.multiplier + (variant.lowHpBonus ?? 0)),
        'x'
      );
    }
  }

  const baseStatus = base.statusEffect;
  const variantStatus = variant.statusEffect;
  if (baseStatus && variantStatus) {
    if (variantStatus.duration !== baseStatus.duration) {
      text = replaceValueText(text, baseStatus.duration, variantStatus.duration, ' turn');
    }
    if (variantStatus.value !== baseStatus.value) {
      text = replaceValueText(text, baseStatus.value, variantStatus.value, ' damage');
      text = replaceValueText(text, baseStatus.value, variantStatus.value, ' HP');
    }
  }

  return `${text} (Rank II)`;
}

const RANK_II_MP_FACTOR = 0.8;
const RANK_II_DAMAGE_FACTOR = 1.2;
const RANK_II_STATUS_VALUE_FACTOR = 1.3;

function makeRankIIAbility(base: AbilityData): AbilityData {
  const damageOrHeal = base.effectType === EffectType.Damage || base.effectType === EffectType.Heal;
  const statusAbility =
    base.effectType === EffectType.Buff ||
    base.effectType === EffectType.Debuff ||
    base.effectType === EffectType.Dot ||
    base.effectType === EffectType.Hot;

  const variant: AbilityData = {
    ...base,
    id: `${base.id}_2`,
    name: `${base.name} II`,
    mpCost: Math.round(base.mpCost * RANK_II_MP_FACTOR),
    multiplier: damageOrHeal ? round2(base.multiplier * RANK_II_DAMAGE_FACTOR) : base.multiplier,
    cooldown: base.cooldown,
  };

  if (statusAbility && base.statusEffect) {
    const dotOrHot = base.effectType === EffectType.Dot || base.effectType === EffectType.Hot;
    variant.statusEffect = {
      ...base.statusEffect,
      duration: base.statusEffect.duration + 1,
      value: dotOrHot ? Math.round(base.statusEffect.value * RANK_II_STATUS_VALUE_FACTOR) : base.statusEffect.value,
    };
  }

  variant.description = rankIIDescription(base, variant);
  return variant;
}

/** Base abilities plus a generated rank-II variant for every one of them. */
export const ABILITIES: Record<string, AbilityData> = { ...BASE_ABILITIES };
for (const base of Object.values(BASE_ABILITIES)) {
  const variant = makeRankIIAbility(base);
  ABILITIES[variant.id] = variant;
}

export function getAbility(id: string): AbilityData | undefined {
  return ABILITIES[id];
}
