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

const honeyBear: FamiliarData = {
  id: 'honeyBear',
  name: 'Honey Bear',
  description: 'A warm-hearted bruiser that protects its allies',
  stats: { hp: 150, maxHp: 150, mp: 60, maxMp: 60, attack: 55, defense: 85, arcane: 35, speed: 45 },
  abilities: ['sturdy', 'rally', 'ironbash'],
  affinity: Affinity.Earth,
  rarity: Rarity.Uncommon,
};

const petalWisp: FamiliarData = {
  id: 'petalWisp',
  name: 'Petal Wisp',
  description: 'A gentle light spirit that mends wounds',
  stats: { hp: 85, maxHp: 85, mp: 100, maxMp: 100, attack: 35, defense: 45, arcane: 85, speed: 70 },
  abilities: ['healpulse', 'purify', 'focus'],
  affinity: Affinity.Light,
  rarity: Rarity.Common,
};

const crystalMole: FamiliarData = {
  id: 'crystalMole',
  name: 'Crystal Mole',
  description: 'A burrowing tank with crystal-hard hide',
  stats: { hp: 135, maxHp: 135, mp: 55, maxMp: 55, attack: 75, defense: 90, arcane: 40, speed: 35 },
  abilities: ['ironbash', 'thornCoat'],
  affinity: Affinity.Earth,
  rarity: Rarity.Uncommon,
};

const echoBat: FamiliarData = {
  id: 'echoBat',
  name: 'Echo Bat',
  description: 'A swift cave dweller that strikes before it is seen',
  stats: { hp: 80, maxHp: 80, mp: 80, maxMp: 80, attack: 55, defense: 35, arcane: 75, speed: 100 },
  abilities: ['quickstep', 'windWard', 'thunderclap'],
  affinity: Affinity.Wind,
  rarity: Rarity.Uncommon,
};

const thornWolf: FamiliarData = {
  id: 'thornWolf',
  name: 'Thorn Wolf',
  description: 'A feral guardian wrapped in living thorns',
  stats: { hp: 115, maxHp: 115, mp: 65, maxMp: 65, attack: 85, defense: 55, arcane: 45, speed: 80 },
  abilities: ['brave', 'thornCoat', 'rootSnare'],
  affinity: Affinity.Earth,
  rarity: Rarity.Rare,
};

const moonMoth: FamiliarData = {
  id: 'moonMoth',
  name: 'Moon Moth',
  description: 'A nocturnal caster that curses from the shadows',
  stats: { hp: 95, maxHp: 95, mp: 110, maxMp: 110, attack: 40, defense: 45, arcane: 95, speed: 75 },
  abilities: ['nightTerror', 'hex', 'focus'],
  affinity: Affinity.Dark,
  rarity: Rarity.Rare,
};

const emberFox: FamiliarData = {
  id: 'emberFox',
  name: 'Ember Fox',
  description: 'A cunning fire mage with a burning tail',
  stats: { hp: 100, maxHp: 100, mp: 110, maxMp: 110, attack: 45, defense: 45, arcane: 100, speed: 70 },
  abilities: ['fireball', 'flameLash', 'cinderCloak'],
  affinity: Affinity.Fire,
  rarity: Rarity.Rare,
};

const magmaHound: FamiliarData = {
  id: 'magmaHound',
  name: 'Magma Hound',
  description: 'A relentless hound with molten armor',
  stats: { hp: 155, maxHp: 155, mp: 70, maxMp: 70, attack: 90, defense: 70, arcane: 50, speed: 55 },
  abilities: ['brave', 'magmaArmor', 'flameLash'],
  affinity: Affinity.Fire,
  rarity: Rarity.Rare,
};

const frostHare: FamiliarData = {
  id: 'frostHare',
  name: 'Frost Hare',
  description: 'A quick-footed hare that leaves frost in its wake',
  stats: { hp: 90, maxHp: 90, mp: 90, maxMp: 90, attack: 60, defense: 45, arcane: 70, speed: 95 },
  abilities: ['quickstep', 'frostbite'],
  affinity: Affinity.Water,
  rarity: Rarity.Uncommon,
};

const glacierOwl: FamiliarData = {
  id: 'glacierOwl',
  name: 'Glacier Owl',
  description: 'A patient guardian of the high peaks',
  stats: { hp: 120, maxHp: 120, mp: 120, maxMp: 120, attack: 45, defense: 65, arcane: 100, speed: 60 },
  abilities: ['frozenTide', 'glacialWard', 'healpulse'],
  affinity: Affinity.Water,
  rarity: Rarity.Rare,
};

const inkSerpent: FamiliarData = {
  id: 'inkSerpent',
  name: 'Ink Serpent',
  description: 'A drowned scholar that poisons with forbidden ink',
  stats: { hp: 110, maxHp: 110, mp: 115, maxMp: 115, attack: 50, defense: 55, arcane: 95, speed: 65 },
  abilities: ['hex', 'siphon', 'lifedrain'],
  affinity: Affinity.Water,
  rarity: Rarity.Rare,
};

const runeGolem: FamiliarData = {
  id: 'runeGolem',
  name: 'Rune Golem',
  description: 'An ancient stone construct covered in runes',
  stats: { hp: 180, maxHp: 180, mp: 90, maxMp: 90, attack: 60, defense: 130, arcane: 55, speed: 30 },
  abilities: ['runeShield', 'ironbash', 'sturdy'],
  affinity: Affinity.Earth,
  rarity: Rarity.Rare,
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

const emberTitan: FamiliarData = {
  id: 'emberTitan',
  name: 'Ember Titan',
  description: 'A colossal furnace given form, ruler of Ember Hollow',
  stats: { hp: 380, maxHp: 380, mp: 180, maxMp: 180, attack: 160, defense: 150, arcane: 150, speed: 120 },
  abilities: ['flameLash', 'magmaArmor', 'fireball'],
  affinity: Affinity.Fire,
  rarity: Rarity.Rare,
  isBoss: true,
};

const frostQueen: FamiliarData = {
  id: 'frostQueen',
  name: 'Frost Queen',
  description: 'The frozen sovereign of Frostpeak Summit',
  stats: { hp: 420, maxHp: 420, mp: 220, maxMp: 220, attack: 140, defense: 160, arcane: 210, speed: 130 },
  abilities: ['frozenTide', 'glacialWard', 'healpulse'],
  affinity: Affinity.Water,
  rarity: Rarity.Legendary,
  isBoss: true,
};

const archiveKeeper: FamiliarData = {
  id: 'archiveKeeper',
  name: 'Archive Keeper',
  description: 'The last librarian of the Sunken Archive',
  stats: { hp: 480, maxHp: 480, mp: 260, maxMp: 260, attack: 170, defense: 190, arcane: 220, speed: 140 },
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
