import type { ChestTier } from '@/types/exploration';
import { AREAS } from '@/data/areas';

/**
 * The effect a curio choice can produce. A choice rolls one outcome by weight;
 * the backend applies it to the run and reports what changed.
 */
export type CurioOutcome =
  | { kind: 'healParty'; hpPct: number; mpPct: number }
  | { kind: 'hurtParty'; hpPct: number }
  | { kind: 'chest'; tier: ChestTier }
  | { kind: 'coins'; min: number; max: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'bond'; amount: number }
  | { kind: 'ambush' }
  | { kind: 'nothing' };

export interface CurioOption {
  id: string;
  label: string;
  /** Consumed from run loot first, then the bank. */
  requiresItem?: string;
  /** Paid from run-loot coins first, then the bank. */
  costCurrency?: number;
  outcomes: { weight: number; outcome: CurioOutcome; text: string }[];
}

export interface CurioData {
  id: string;
  name: string;
  description: string;
  areas: string[];
  options: CurioOption[];
}

const ALL_AREAS = Object.keys(AREAS);

export const CURIOS: Record<string, CurioData> = {
  mossyShrine: {
    id: 'mossyShrine',
    name: 'Mossy Shrine',
    description: 'A low stone shrine, furred with moss and warmed by a shaft of pale light.',
    areas: ['verdantMeadow', 'shadowForest'],
    options: [
      {
        id: 'pray',
        label: 'Pray',
        outcomes: [
          {
            weight: 55,
            outcome: { kind: 'healParty', hpPct: 30, mpPct: 20 },
            text: 'You kneel in the moss. Warmth seeps into your party’s wounds.',
          },
          {
            weight: 30,
            outcome: { kind: 'nothing' },
            text: 'You kneel and wait. The shrine stays silent, but you feel no worse for it.',
          },
          {
            weight: 15,
            outcome: { kind: 'hurtParty', hpPct: 10 },
            text: 'The moss prickles and bites. Your party recoils, stung.',
          },
        ],
      },
      {
        id: 'offerPotion',
        label: 'Offer a Small Potion',
        requiresItem: 'potion_small',
        outcomes: [
          {
            weight: 100,
            outcome: { kind: 'healParty', hpPct: 50, mpPct: 40 },
            text: 'The shrine drinks the potion and returns it as soft green light.',
          },
        ],
      },
    ],
  },
  abandonedPack: {
    id: 'abandonedPack',
    name: 'Abandoned Pack',
    description: 'A traveller’s pack slumps against the wall, straps cut and seams straining.',
    areas: ALL_AREAS,
    options: [
      {
        id: 'search',
        label: 'Search it',
        outcomes: [
          {
            weight: 45,
            outcome: { kind: 'chest', tier: 'common' },
            text: 'The pack is stuffed with supplies someone abandoned in a hurry.',
          },
          {
            weight: 25,
            outcome: { kind: 'coins', min: 20, max: 60 },
            text: 'A handful of coins rolls out of the lining.',
          },
          {
            weight: 30,
            outcome: { kind: 'ambush' },
            text: 'The pack was bait. Something bursts from the brush!',
          },
        ],
      },
    ],
  },
  glowingPool: {
    id: 'glowingPool',
    name: 'Glowing Pool',
    description: 'Still water glows from below, bright enough to read by.',
    areas: ['crystalCaves', 'frostpeakSummit', 'sunkenArchive'],
    options: [
      {
        id: 'drink',
        label: 'Drink',
        outcomes: [
          {
            weight: 50,
            outcome: { kind: 'healParty', hpPct: 0, mpPct: 50 },
            text: 'The water is cold and bright. Your mind sharpens.',
          },
          {
            weight: 30,
            outcome: { kind: 'xp', amount: 40 },
            text: 'Memories not your own surface, and something in you grows.',
          },
          {
            weight: 20,
            outcome: { kind: 'hurtParty', hpPct: 15 },
            text: 'The water burns going down. Your party doubles over.',
          },
        ],
      },
      {
        id: 'purify',
        label: 'Purify with an Antidote',
        requiresItem: 'antidote',
        outcomes: [
          {
            weight: 100,
            outcome: { kind: 'healParty', hpPct: 60, mpPct: 60 },
            text: 'The antidote clears the pool’s murk; its light settles into all of you.',
          },
        ],
      },
    ],
  },
  strangeAltar: {
    id: 'strangeAltar',
    name: 'Strange Altar',
    description: 'A black slab carved with runes that shift when you are not looking directly at them.',
    areas: ['shadowForest', 'emberHollow', 'sunkenArchive'],
    options: [
      {
        id: 'offerCoins',
        label: 'Offer 60 coins',
        costCurrency: 60,
        outcomes: [
          {
            weight: 70,
            outcome: { kind: 'chest', tier: 'rare' },
            text: 'The coins vanish. The altar returns a heavier prize.',
          },
          {
            weight: 30,
            outcome: { kind: 'nothing' },
            text: 'The coins vanish. The altar gives nothing back.',
          },
        ],
      },
      {
        id: 'touchRunes',
        label: 'Touch the runes',
        outcomes: [
          {
            weight: 40,
            outcome: { kind: 'xp', amount: 60 },
            text: 'The runes flare. Knowledge pours through your fingertips.',
          },
          {
            weight: 60,
            outcome: { kind: 'hurtParty', hpPct: 20 },
            text: 'The runes reject you. Force slams your party back.',
          },
        ],
      },
    ],
  },
  familiarNest: {
    id: 'familiarNest',
    name: 'Familiar Nest',
    description: 'A bowl of trampled grass and soft fur, still warm.',
    areas: ALL_AREAS,
    options: [
      {
        id: 'approach',
        label: 'Approach softly',
        outcomes: [
          {
            weight: 60,
            outcome: { kind: 'bond', amount: 1 },
            text: 'A young familiar sniffs your hand and decides you are safe.',
          },
          {
            weight: 40,
            outcome: { kind: 'ambush' },
            text: 'You are not the only thing drawn to this nest.',
          },
        ],
      },
      {
        id: 'leavePotion',
        label: 'Leave a Small Potion',
        requiresItem: 'potion_small',
        outcomes: [
          {
            weight: 100,
            outcome: { kind: 'bond', amount: 1 },
            text: 'The nest’s guardian drinks the potion and remembers your kindness.',
          },
        ],
      },
    ],
  },
  emberBrazier: {
    id: 'emberBrazier',
    name: 'Ember Brazier',
    description: 'A wide bronze bowl of coals that breathe orange with every draft.',
    areas: ['emberHollow'],
    options: [
      {
        id: 'reach',
        label: 'Reach into the coals',
        outcomes: [
          {
            weight: 50,
            outcome: { kind: 'chest', tier: 'rare' },
            text: 'Your fingers close on something cool and heavy in the coals.',
          },
          {
            weight: 50,
            outcome: { kind: 'hurtParty', hpPct: 20 },
            text: 'The coals bite through your sleeve. Your party pulls back, scorched.',
          },
        ],
      },
      {
        id: 'douse',
        label: 'Douse it with a Frost Bomb',
        requiresItem: 'frost_bomb',
        outcomes: [
          {
            weight: 100,
            outcome: { kind: 'chest', tier: 'rare' },
            text: 'The frost bomb bursts. The coals crack open and spill their treasure.',
          },
        ],
      },
    ],
  },
  frozenStatue: {
    id: 'frozenStatue',
    name: 'Frozen Statue',
    description: 'A figure stands mid-stride inside a block of clouded ice.',
    areas: ['frostpeakSummit'],
    options: [
      {
        id: 'chip',
        label: 'Chip the ice',
        outcomes: [
          {
            weight: 40,
            outcome: { kind: 'chest', tier: 'common' },
            text: 'A seam in the ice gives way, and a small cache tumbles free.',
          },
          {
            weight: 40,
            outcome: { kind: 'nothing' },
            text: 'The ice is too thick. You only numb your hands.',
          },
          {
            weight: 20,
            outcome: { kind: 'ambush' },
            text: 'The statue was not a statue. It shatters and lunges!',
          },
        ],
      },
      {
        id: 'thaw',
        label: 'Thaw it with a Fire Bomb',
        requiresItem: 'fire_bomb',
        outcomes: [
          {
            weight: 100,
            outcome: { kind: 'chest', tier: 'rare' },
            text: 'The fire bomb melts the shell, revealing what the frost preserved.',
          },
        ],
      },
    ],
  },
  dustyTome: {
    id: 'dustyTome',
    name: 'Dusty Tome',
    description: 'A fat book lies open on a reading stand, its pages swollen with damp.',
    areas: ['sunkenArchive'],
    options: [
      {
        id: 'read',
        label: 'Read it',
        outcomes: [
          {
            weight: 50,
            outcome: { kind: 'xp', amount: 80 },
            text: 'The pages are slippery with age, but the words stick.',
          },
          {
            weight: 50,
            outcome: { kind: 'hurtParty', hpPct: 15 },
            text: 'The ink crawls off the page and into your thoughts. Your party staggers.',
          },
        ],
      },
      {
        id: 'readCharm',
        label: 'Read it with a Focus Charm',
        requiresItem: 'focus_charm',
        outcomes: [
          {
            weight: 100,
            outcome: { kind: 'xp', amount: 120 },
            text: 'The charm steadies your mind; the tome’s secrets unfold cleanly.',
          },
        ],
      },
    ],
  },
};

export function getCurio(id: string): CurioData | undefined {
  return CURIOS[id];
}

/** Curios that can appear in the given area. */
export function curiosForArea(areaId: string): CurioData[] {
  return Object.values(CURIOS).filter((curio) => curio.areas.includes(areaId));
}
