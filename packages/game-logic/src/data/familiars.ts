export enum Affinity {
  Light,
  Dark,
  Fire,
  Water,
  Earth,
  Wind,
}

export enum Rarity {
  Common,
  Uncommon,
  Rare,
  Legendary,
}

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
  affinity: Affinity;
  rarity: Rarity;
  isBoss?: boolean;
  sprite?: string;
}

const whiteDog: FamiliarData = {
  id: 'whiteDog',
  name: 'White Dog',
  description: 'A loyal companion with balanced stats and defensive capabilities',
  stats: { hp: 120, maxHp: 120, mp: 80, maxMp: 80, attack: 55, defense: 70, arcane: 45, speed: 60 },
  abilities: ['brave', 'sturdy'],
  affinity: Affinity.Light,
  rarity: Rarity.Common,
};

const yellowFighter: FamiliarData = {
  id: 'yellowFighter',
  name: 'Yellow Fighter',
  description: 'A fierce warrior with high attack power',
  stats: { hp: 140, maxHp: 140, mp: 60, maxMp: 60, attack: 80, defense: 45, arcane: 35, speed: 75 },
  abilities: ['brave'],
  affinity: Affinity.Fire,
  rarity: Rarity.Common,
};

const aquaSprite: FamiliarData = {
  id: 'aquaSprite',
  name: 'Aqua Sprite',
  description: 'A mystical water creature with strong healing and magic',
  stats: { hp: 90, maxHp: 90, mp: 100, maxMp: 100, attack: 40, defense: 50, arcane: 80, speed: 55 },
  abilities: ['healpulse', 'sturdy'],
  affinity: Affinity.Water,
  rarity: Rarity.Common,
};

const leafBunny: FamiliarData = {
  id: 'leafBunny',
  name: 'Leaf Bunny',
  description: 'A gentle earth creature with solid defenses',
  stats: { hp: 110, maxHp: 110, mp: 70, maxMp: 70, attack: 50, defense: 80, arcane: 40, speed: 65 },
  abilities: ['sturdy', 'brave'],
  affinity: Affinity.Earth,
  rarity: Rarity.Common,
};

const sparkMouse: FamiliarData = {
  id: 'sparkMouse',
  name: 'Spark Mouse',
  description: 'A swift wind creature with lightning reflexes',
  stats: { hp: 75, maxHp: 75, mp: 60, maxMp: 60, attack: 60, defense: 35, arcane: 65, speed: 90 },
  abilities: ['brave', 'quickstep'],
  affinity: Affinity.Wind,
  rarity: Rarity.Common,
};

const tideTurtle: FamiliarData = {
  id: 'tideTurtle',
  name: 'Tide Turtle',
  description: 'A sturdy aquatic creature with balanced stats',
  stats: { hp: 130, maxHp: 130, mp: 70, maxMp: 70, attack: 50, defense: 75, arcane: 50, speed: 40 },
  abilities: ['sturdy', 'healpulse'],
  affinity: Affinity.Water,
  rarity: Rarity.Uncommon,
};

const shadowCat: FamiliarData = {
  id: 'shadowCat',
  name: 'Shadow Cat',
  description: 'A stealthy dark creature with powerful strikes',
  stats: { hp: 100, maxHp: 100, mp: 90, maxMp: 90, attack: 70, defense: 45, arcane: 75, speed: 85 },
  abilities: ['shadowstrike', 'quickstep'],
  affinity: Affinity.Dark,
  rarity: Rarity.Uncommon,
};

const meadowGuardian: FamiliarData = {
  id: 'meadowGuardian',
  name: 'Meadow Guardian',
  description: 'An ancient protector of the Verdant Meadow',
  stats: { hp: 240, maxHp: 240, mp: 160, maxMp: 160, attack: 110, defense: 140, arcane: 90, speed: 120 },
  abilities: ['brave', 'sturdy', 'naturabless'],
  affinity: Affinity.Light,
  rarity: Rarity.Rare,
  isBoss: true,
};

const caveWarden: FamiliarData = {
  id: 'caveWarden',
  name: 'Cave Warden',
  description: 'A powerful guardian of the Crystal Caves',
  stats: { hp: 325, maxHp: 325, mp: 175, maxMp: 175, attack: 125, defense: 187, arcane: 125, speed: 100 },
  abilities: ['sturdy', 'healpulse', 'ironbash'],
  affinity: Affinity.Water,
  rarity: Rarity.Rare,
  isBoss: true,
};

const shadowLord: FamiliarData = {
  id: 'shadowLord',
  name: 'Shadow Lord',
  description: 'A terrifying master of darkness dwelling in the Shadow Forest',
  stats: { hp: 300, maxHp: 300, mp: 270, maxMp: 270, attack: 210, defense: 135, arcane: 225, speed: 255 },
  abilities: ['shadowstrike', 'quickstep', 'fireball'],
  affinity: Affinity.Dark,
  rarity: Rarity.Legendary,
  isBoss: true,
};

export const FAMILIARS: Record<string, FamiliarData> = {
  whiteDog,
  yellowFighter,
  aquaSprite,
  leafBunny,
  sparkMouse,
  tideTurtle,
  shadowCat,
  meadowGuardian,
  caveWarden,
  shadowLord,
};

export function getFamiliar(id: string): FamiliarData | undefined {
  return FAMILIARS[id];
}
