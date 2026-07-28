export interface FamiliarStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  arcane: number;
  speed: number;
}

export interface FamiliarData {
  id: string;
  name: string;
  description: string;
  stats: FamiliarStats;
  abilities: string[];
  sprite?: string;
}

export const FAMILIARS: Record<string, FamiliarData> = {
  whiteDog: {
    id: "whiteDog",
    name: "White Dog",
    description: "A loyal canine familiar with balanced stats.",
    stats: {
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      attack: 12,
      defense: 10,
      arcane: 8,
      speed: 11,
    },
    abilities: ["brave", "sturdy"],
  },
  yellowFighter: {
    id: "yellowFighter",
    name: "Yellow Fighter",
    description: "An aggressive combat familiar with high attack.",
    stats: {
      hp: 80,
      maxHp: 80,
      mp: 20,
      maxMp: 20,
      attack: 18,
      defense: 7,
      arcane: 5,
      speed: 14,
    },
    abilities: ["brave"],
  },
};
