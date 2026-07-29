import type { Area } from '../types/exploration';

export const AREAS: Record<string, Area> = {
  verdantMeadow: {
    id: 'verdantMeadow',
    name: 'Verdant Meadow',
    description: 'A peaceful meadow with wild familiars',
    levelRange: [1, 3],
    encounterPool: ['whiteDog', 'leafBunny', 'sparkMouse'],
    roomCount: 5,
    bossId: 'meadowGuardian',
    bossReward: { currency: 50, items: ['potion_medium'] },
    bgColor: 0x2d5a27,
  },
  crystalCaves: {
    id: 'crystalCaves',
    name: 'Crystal Caves',
    description: 'Shimmering caves with rare creatures',
    levelRange: [3, 5],
    encounterPool: ['aquaSprite', 'yellowFighter', 'tideTurtle'],
    roomCount: 6,
    bossId: 'caveWarden',
    bossReward: { currency: 100, items: ['potion_medium', 'ether_small'] },
    bgColor: 0x3a3a6e,
  },
  shadowForest: {
    id: 'shadowForest',
    name: 'Shadow Forest',
    description: 'A dark forest with powerful familiars',
    levelRange: [5, 8],
    encounterPool: ['whiteDog', 'yellowFighter', 'shadowCat', 'aquaSprite'],
    roomCount: 7,
    bossId: 'shadowLord',
    bossReward: { currency: 200, items: ['potion_medium', 'ether_small'] },
    bgColor: 0x1a1a2e,
  },
};
