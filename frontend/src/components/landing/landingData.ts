// Landing-page-only presentation data. Familiar names, descriptions, stats and
// affinities come from @arcane-familiars/game-logic; this file only pairs a
// species id with the art imports the hero stage needs.

import whiteDogPortrait from '@/assets/landing/familiar-whiteDog.webp';
import leafBunnyPortrait from '@/assets/landing/familiar-leafBunny.webp';
import sparkMousePortrait from '@/assets/landing/familiar-sparkMouse.webp';
import aquaSpritePortrait from '@/assets/landing/familiar-aquaSprite.webp';
import tideTurtlePortrait from '@/assets/landing/familiar-tideTurtle.webp';
import shadowCatPortrait from '@/assets/landing/familiar-shadowCat.webp';
import yellowFighterPortrait from '@/assets/landing/familiar-yellowFighter.webp';

import verdantMeadow from '@/assets/landing/area-verdant-meadow.webp';
import verdantMeadowTwo from '@/assets/landing/area-verdant-meadow-2.webp';
import frostpeakSummit from '@/assets/landing/area-frostpeak-summit.webp';
import sunkenArchive from '@/assets/landing/area-sunken-archive.webp';
import shadowForest from '@/assets/landing/area-shadow-forest.webp';
import emberHollow from '@/assets/landing/area-ember-hollow.webp';

export interface HeroFamiliar {
  /** Species id in FAMILIARS. */
  id: string;
  /** 256x256 transparent portrait. */
  portrait: string;
  /** 640x480 area painting shown behind the portrait. */
  backdrop: string;
}

/** The seven playable familiars, in hero roster order. */
export const HERO_FAMILIARS: HeroFamiliar[] = [
  { id: 'whiteDog', portrait: whiteDogPortrait, backdrop: verdantMeadow },
  { id: 'leafBunny', portrait: leafBunnyPortrait, backdrop: verdantMeadowTwo },
  { id: 'sparkMouse', portrait: sparkMousePortrait, backdrop: frostpeakSummit },
  { id: 'aquaSprite', portrait: aquaSpritePortrait, backdrop: sunkenArchive },
  { id: 'tideTurtle', portrait: tideTurtlePortrait, backdrop: sunkenArchive },
  { id: 'shadowCat', portrait: shadowCatPortrait, backdrop: shadowForest },
  { id: 'yellowFighter', portrait: yellowFighterPortrait, backdrop: emberHollow },
];
