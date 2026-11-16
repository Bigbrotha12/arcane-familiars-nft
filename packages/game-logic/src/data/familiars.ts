import type { PassiveId } from '@/data/passives';

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
  /** Party passive species ability (non-boss familiars only). */
  passive?: PassiveId;
  sprite?: string;
}

const whiteDog: FamiliarData = {
  id: 'whiteDog',
  name: 'White Dog',
  description: 'A loyal companion with balanced stats and defensive capabilities',
  stats: { hp: 120, maxHp: 120, mp: 80, maxMp: 80, attack: 55, defense: 70, arcane: 45, speed: 60 },
  abilities: ['brave', 'sturdy'],
  passive: 'secondWind',
  affinity: Affinity.Light,
  rarity: Rarity.Common,
};

const yellowFighter: FamiliarData = {
  id: 'yellowFighter',
  name: 'Yellow Fighter',
  description: 'A fierce warrior with high attack power',
  stats: { hp: 140, maxHp: 140, mp: 60, maxMp: 60, attack: 80, defense: 45, arcane: 35, speed: 75 },
  abilities: ['brave'],
  passive: 'battleCry',
  affinity: Affinity.Fire,
  rarity: Rarity.Common,
};

const aquaSprite: FamiliarData = {
  id: 'aquaSprite',
  name: 'Aqua Sprite',
  description: 'A mystical water creature with strong healing and magic',
  stats: { hp: 90, maxHp: 90, mp: 100, maxMp: 100, attack: 40, defense: 50, arcane: 80, speed: 55 },
  abilities: ['healpulse', 'sturdy'],
  passive: 'tidecaller',
  affinity: Affinity.Water,
  rarity: Rarity.Common,
};

const leafBunny: FamiliarData = {
  id: 'leafBunny',
  name: 'Leaf Bunny',
  description: 'A gentle earth creature with solid defenses',
  stats: { hp: 110, maxHp: 110, mp: 70, maxMp: 70, attack: 50, defense: 80, arcane: 40, speed: 65 },
  abilities: ['sturdy', 'brave'],
  passive: 'bedrock',
  affinity: Affinity.Earth,
  rarity: Rarity.Common,
};

const sparkMouse: FamiliarData = {
  id: 'sparkMouse',
  name: 'Spark Mouse',
  description: 'A swift wind creature with lightning reflexes',
  stats: { hp: 75, maxHp: 75, mp: 60, maxMp: 60, attack: 60, defense: 35, arcane: 65, speed: 90 },
  abilities: ['brave', 'quickstep'],
  passive: 'tailwind',
  affinity: Affinity.Wind,
  rarity: Rarity.Common,
};

const tideTurtle: FamiliarData = {
  id: 'tideTurtle',
  name: 'Tide Turtle',
  description: 'A sturdy aquatic creature with balanced stats',
  stats: { hp: 130, maxHp: 130, mp: 70, maxMp: 70, attack: 50, defense: 75, arcane: 50, speed: 40 },
  abilities: ['sturdy', 'healpulse'],
  passive: 'tidecaller',
  affinity: Affinity.Water,
  rarity: Rarity.Uncommon,
};

const shadowCat: FamiliarData = {
  id: 'shadowCat',
  name: 'Shadow Cat',
  description: 'A stealthy dark creature with powerful strikes',
  stats: { hp: 100, maxHp: 100, mp: 90, maxMp: 90, attack: 70, defense: 45, arcane: 75, speed: 85 },
  abilities: ['shadowstrike', 'quickstep'],
  passive: 'umbralHunger',
  affinity: Affinity.Dark,
  rarity: Rarity.Uncommon,
};

const honeyBear: FamiliarData = {
  id: 'honeyBear',
  name: 'Honey Bear',
  description: 'A warm-hearted bruiser that protects its allies',
  stats: { hp: 150, maxHp: 150, mp: 60, maxMp: 60, attack: 55, defense: 85, arcane: 35, speed: 45 },
  abilities: ['sturdy', 'rally', 'ironbash'],
  passive: 'battleCry',
  affinity: Affinity.Earth,
  rarity: Rarity.Uncommon,
};

const petalWisp: FamiliarData = {
  id: 'petalWisp',
  name: 'Petal Wisp',
  description: 'A gentle light spirit that mends wounds',
  stats: { hp: 85, maxHp: 85, mp: 100, maxMp: 100, attack: 35, defense: 45, arcane: 85, speed: 70 },
  abilities: ['healpulse', 'purify', 'focus'],
  passive: 'radiance',
  affinity: Affinity.Light,
  rarity: Rarity.Common,
};

const crystalMole: FamiliarData = {
  id: 'crystalMole',
  name: 'Crystal Mole',
  description: 'A burrowing tank with crystal-hard hide',
  stats: { hp: 135, maxHp: 135, mp: 55, maxMp: 55, attack: 75, defense: 90, arcane: 40, speed: 35 },
  abilities: ['ironbash', 'thornCoat'],
  passive: 'bedrock',
  affinity: Affinity.Earth,
  rarity: Rarity.Uncommon,
};

const echoBat: FamiliarData = {
  id: 'echoBat',
  name: 'Echo Bat',
  description: 'A swift cave dweller that strikes before it is seen',
  stats: { hp: 80, maxHp: 80, mp: 80, maxMp: 80, attack: 55, defense: 35, arcane: 75, speed: 100 },
  abilities: ['quickstep', 'windWard', 'thunderclap'],
  passive: 'tailwind',
  affinity: Affinity.Wind,
  rarity: Rarity.Uncommon,
};

const thornWolf: FamiliarData = {
  id: 'thornWolf',
  name: 'Thorn Wolf',
  description: 'A feral guardian wrapped in living thorns',
  stats: { hp: 115, maxHp: 115, mp: 65, maxMp: 65, attack: 85, defense: 55, arcane: 45, speed: 80 },
  abilities: ['brave', 'thornCoat', 'rootSnare'],
  passive: 'relayInstinct',
  affinity: Affinity.Earth,
  rarity: Rarity.Rare,
};

const moonMoth: FamiliarData = {
  id: 'moonMoth',
  name: 'Moon Moth',
  description: 'A nocturnal caster that curses from the shadows',
  stats: { hp: 95, maxHp: 95, mp: 110, maxMp: 110, attack: 40, defense: 45, arcane: 95, speed: 75 },
  abilities: ['nightTerror', 'hex', 'focus'],
  passive: 'umbralHunger',
  affinity: Affinity.Dark,
  rarity: Rarity.Rare,
};

const emberFox: FamiliarData = {
  id: 'emberFox',
  name: 'Ember Fox',
  description: 'A cunning fire mage with a burning tail',
  stats: { hp: 100, maxHp: 100, mp: 110, maxMp: 110, attack: 45, defense: 45, arcane: 100, speed: 70 },
  abilities: ['fireball', 'flameLash', 'cinderCloak'],
  passive: 'kindling',
  affinity: Affinity.Fire,
  rarity: Rarity.Rare,
};

const magmaHound: FamiliarData = {
  id: 'magmaHound',
  name: 'Magma Hound',
  description: 'A relentless hound with molten armor',
  stats: { hp: 145, maxHp: 145, mp: 70, maxMp: 70, attack: 74, defense: 70, arcane: 50, speed: 55 },
  abilities: ['brave', 'magmaArmor', 'flameLash'],
  passive: 'kindling',
  affinity: Affinity.Fire,
  rarity: Rarity.Rare,
};

const frostHare: FamiliarData = {
  id: 'frostHare',
  name: 'Frost Hare',
  description: 'A quick-footed hare that leaves frost in its wake',
  stats: { hp: 90, maxHp: 90, mp: 90, maxMp: 90, attack: 60, defense: 45, arcane: 70, speed: 95 },
  abilities: ['quickstep', 'frostbite'],
  passive: 'relayInstinct',
  affinity: Affinity.Water,
  rarity: Rarity.Uncommon,
};

const glacierOwl: FamiliarData = {
  id: 'glacierOwl',
  name: 'Glacier Owl',
  description: 'A patient guardian of the high peaks',
  stats: { hp: 120, maxHp: 120, mp: 120, maxMp: 120, attack: 45, defense: 65, arcane: 100, speed: 60 },
  abilities: ['frozenTide', 'glacialWard', 'healpulse'],
  passive: 'manaSpring',
  affinity: Affinity.Water,
  rarity: Rarity.Rare,
};

const inkSerpent: FamiliarData = {
  id: 'inkSerpent',
  name: 'Ink Serpent',
  description: 'A drowned scholar that poisons with forbidden ink',
  stats: { hp: 110, maxHp: 110, mp: 115, maxMp: 115, attack: 50, defense: 55, arcane: 95, speed: 65 },
  abilities: ['hex', 'siphon', 'lifedrain'],
  passive: 'umbralHunger',
  affinity: Affinity.Water,
  rarity: Rarity.Rare,
};

const runeGolem: FamiliarData = {
  id: 'runeGolem',
  name: 'Rune Golem',
  description: 'An ancient stone construct covered in runes',
  stats: { hp: 180, maxHp: 180, mp: 90, maxMp: 90, attack: 60, defense: 130, arcane: 55, speed: 30 },
  abilities: ['runeShield', 'ironbash', 'sturdy'],
  passive: 'secondWind',
  affinity: Affinity.Earth,
  rarity: Rarity.Rare,
};

const meadowGuardian: FamiliarData = {
  id: 'meadowGuardian',
  name: 'Meadow Guardian',
  description: 'An ancient protector of the Verdant Meadow',
  stats: { hp: 235, maxHp: 235, mp: 90, maxMp: 90, attack: 60, defense: 60, arcane: 50, speed: 55 },
  abilities: ['brave', 'sturdy', 'naturabless'],
  affinity: Affinity.Light,
  rarity: Rarity.Rare,
  isBoss: true,
};

const caveWarden: FamiliarData = {
  id: 'caveWarden',
  name: 'Cave Warden',
  description: 'A powerful guardian of the Crystal Caves',
  stats: { hp: 228, maxHp: 228, mp: 100, maxMp: 100, attack: 58, defense: 72, arcane: 56, speed: 45 },
  abilities: ['sturdy', 'healpulse', 'ironbash'],
  affinity: Affinity.Water,
  rarity: Rarity.Rare,
  isBoss: true,
};

const shadowLord: FamiliarData = {
  id: 'shadowLord',
  name: 'Shadow Lord',
  description: 'A terrifying master of darkness dwelling in the Shadow Forest',
  stats: { hp: 182, maxHp: 182, mp: 130, maxMp: 130, attack: 58, defense: 55, arcane: 62, speed: 85 },
  abilities: ['shadowstrike', 'quickstep', 'fireball'],
  affinity: Affinity.Dark,
  rarity: Rarity.Legendary,
  isBoss: true,
};

const emberTitan: FamiliarData = {
  id: 'emberTitan',
  name: 'Ember Titan',
  description: 'A colossal furnace given form, ruler of Ember Hollow',
  stats: { hp: 265, maxHp: 265, mp: 110, maxMp: 110, attack: 62, defense: 66, arcane: 56, speed: 60 },
  abilities: ['flameLash', 'magmaArmor', 'fireball'],
  affinity: Affinity.Fire,
  rarity: Rarity.Rare,
  isBoss: true,
};

const frostQueen: FamiliarData = {
  id: 'frostQueen',
  name: 'Frost Queen',
  description: 'The frozen sovereign of Frostpeak Summit',
  stats: { hp: 295, maxHp: 295, mp: 140, maxMp: 140, attack: 52, defense: 68, arcane: 76, speed: 68 },
  abilities: ['frozenTide', 'glacialWard', 'healpulse'],
  affinity: Affinity.Water,
  rarity: Rarity.Legendary,
  isBoss: true,
};

const archiveKeeper: FamiliarData = {
  id: 'archiveKeeper',
  name: 'Archive Keeper',
  description: 'The last librarian of the Sunken Archive',
  stats: { hp: 315, maxHp: 315, mp: 160, maxMp: 160, attack: 56, defense: 72, arcane: 68, speed: 70 },
  abilities: ['hex', 'runeShield', 'nightTerror', 'siphon'],
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
  honeyBear,
  petalWisp,
  crystalMole,
  echoBat,
  thornWolf,
  moonMoth,
  emberFox,
  magmaHound,
  frostHare,
  glacierOwl,
  inkSerpent,
  runeGolem,
  meadowGuardian,
  caveWarden,
  shadowLord,
  emberTitan,
  frostQueen,
  archiveKeeper,
};

export function getFamiliar(id: string): FamiliarData | undefined {
  return FAMILIARS[id];
}
