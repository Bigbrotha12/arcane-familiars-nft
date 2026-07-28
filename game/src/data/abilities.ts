export enum AbilityTarget {
  Self = "self",
  Enemy = "enemy",
  Ally = "ally",
}

export enum AbilityEffectType {
  Damage = "damage",
  Heal = "heal",
  Buff = "buff",
  Debuff = "debuff",
}

export interface AbilityEffect {
  type: AbilityEffectType;
  value: number;
  stat?: string;
  duration?: number;
}

export interface AbilityData {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  target: AbilityTarget;
  effects: AbilityEffect[];
  cooldown?: number;
}

export const ABILITIES: Record<string, AbilityData> = {
  brave: {
    id: "brave",
    name: "Brave",
    description: "A courageous strike that deals 1.5x damage.",
    mpCost: 10,
    target: AbilityTarget.Enemy,
    effects: [
      { type: AbilityEffectType.Damage, value: 1.5 },
    ],
    cooldown: 1,
  },
  sturdy: {
    id: "sturdy",
    name: "Sturdy",
    description: "Hardens defenses, reducing incoming damage for 2 turns.",
    mpCost: 8,
    target: AbilityTarget.Self,
    effects: [
      { type: AbilityEffectType.Buff, value: 1.5, stat: "defense", duration: 2 },
    ],
    cooldown: 3,
  },
};
