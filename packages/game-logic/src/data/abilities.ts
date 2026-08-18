export enum EffectType {
  Damage,
  Heal,
  Buff,
  Debuff,
  Dot,
  Hot,
  MpHeal
}

export enum StatName {
  Attack,
  Defense,
  Arcane,
  Speed,
  Hp
}

export enum Target {
  Enemy,
  Self,
  Ally
}

export enum ScalingStat {
  None,
  Attack,
  Arcane
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
  description: 'A powerful strike dealing 1.5x attack damage',
  mpCost: 10,
  target: Target.Enemy,
  effectType: EffectType.Damage,
  scalingStat: ScalingStat.Attack,
  multiplier: 1.5,
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

export const ABILITIES: Record<string, AbilityData> = {
  brave,
  sturdy,
  fireball,
  quickstep,
  healpulse,
  shadowstrike,
  ironbash,
  naturabless,
};

export function getAbility(id: string): AbilityData | undefined {
  return ABILITIES[id];
}
