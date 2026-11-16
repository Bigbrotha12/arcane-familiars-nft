// Data-driven sprite registry. Adding a familiar's art = one FAMILIAR_SPRITES
// entry (+ asset files); no other code changes.
//
// Key conventions (derived here — never hardcode keys at call sites):
// - Portrait texture:      `familiar_<id>`                    (familiarTextureKey)
// - Idle sheet texture:    `familiar_<id>_idle[_left]`        (idleTextureKey)
// - Idle animation key:    identical to the idle texture key  (idleAnimKey — anim and
//   texture share the key by convention; per-familiar because frame counts differ)
// - Effect texture + anim: `effect_<effectId>`                (effectAnimKey — also shared)

import { getFamiliar, Affinity } from '@arcane-familiars/game-logic';
import type { FAMILIARS } from '@arcane-familiars/game-logic';

// Connecting-phase stand-in until real display updates arrive.
export const PLACEHOLDER_FAMILIAR_ID = 'whiteDog';

export interface SpriteSheetConfig {
  file: string; // path under /assets/sprites/ for effects, under /assets/sprites/familiars/<id>/ for idle
  frameWidth: number;
  frameHeight: number;
  frameRate: number;
}

export interface FamiliarSpriteConfig {
  idle?: SpriteSheetConfig; // right-facing; left variant is a sibling file with _left suffix before extension
  left?: boolean; // whether the `_left` idle sheet exists (default true, per asset spec)
  abilityEffect?: keyof typeof EFFECT_SPRITES;
}

export const EFFECT_SPRITES = {
  cast_light: { file: 'effects/effect_cast_light.png', frameWidth: 96, frameHeight: 96, frameRate: 24 },
  cast_water: { file: 'effects/effect_cast_water.png', frameWidth: 96, frameHeight: 96, frameRate: 24 },
  fire_attack: { file: 'effects/effect_fire_attack.png', frameWidth: 96, frameHeight: 96, frameRate: 24 },
  cast_earth: { file: 'effects/effect_cast_earth.png', frameWidth: 96, frameHeight: 96, frameRate: 16 },
  cast_wind: { file: 'effects/effect_cast_wind.png', frameWidth: 96, frameHeight: 96, frameRate: 24 },
  cast_dark: { file: 'effects/effect_cast_dark.png', frameWidth: 96, frameHeight: 96, frameRate: 24 },
} satisfies Record<string, SpriteSheetConfig>;

// Partial keyed by familiar ids: sprite art is optional per familiar, so only familiars with art get entries (no empty configs).
export const FAMILIAR_SPRITES: Partial<Record<keyof typeof FAMILIARS, FamiliarSpriteConfig>> = {
  aquaSprite: {
    idle: { file: 'idle/aquaSprite_idle.png', frameWidth: 64, frameHeight: 64, frameRate: 24 },
    abilityEffect: 'cast_water',
  },
  whiteDog: {
    idle: { file: 'idle/whiteDog_idle.png', frameWidth: 64, frameHeight: 64, frameRate: 24 },
    abilityEffect: 'cast_light',
  },
  yellowFighter: {
    idle: { file: 'idle/yellowFighter_idle.png', frameWidth: 64, frameHeight: 64, frameRate: 24 },
    abilityEffect: 'fire_attack',
  },
};

const EFFECT_BY_AFFINITY: Record<Affinity, keyof typeof EFFECT_SPRITES> = {
  [Affinity.Light]: 'cast_light',
  [Affinity.Water]: 'cast_water',
  [Affinity.Fire]: 'fire_attack',
  [Affinity.Earth]: 'cast_earth',
  [Affinity.Wind]: 'cast_wind',
  [Affinity.Dark]: 'cast_dark',
};

/** Ability effect for familiars without their own: one per affinity. */
export function defaultEffectForAffinity(affinity: Affinity): keyof typeof EFFECT_SPRITES {
  return EFFECT_BY_AFFINITY[affinity];
}

export function getFamiliarSprites(id: string): FamiliarSpriteConfig | undefined {
  return FAMILIAR_SPRITES[id];
}

export function familiarTextureKey(id: string): string {
  return `familiar_${id}`;
}

const FALLBACK_BY_AFFINITY: Record<Affinity, string> = {
  [Affinity.Light]: 'whiteDog',
  [Affinity.Dark]: 'shadowCat',
  [Affinity.Fire]: 'yellowFighter',
  [Affinity.Water]: 'aquaSprite',
  [Affinity.Earth]: 'leafBunny',
  [Affinity.Wind]: 'sparkMouse',
};

/** Portrait key with a guaranteed affinity-matched fallback for familiars without art yet. */
export function safeFamiliarTextureKey(scene: { textures: { exists: (key: string) => boolean } }, id: string): string {
  const key = familiarTextureKey(id);
  if (scene.textures.exists(key)) return key;
  const affinity = getFamiliar(id)?.affinity ?? Affinity.Light;
  return familiarTextureKey(FALLBACK_BY_AFFINITY[affinity]);
}

export function idleTextureKey(id: string, facing: 'right' | 'left'): string {
  return facing === 'right' ? `familiar_${id}_idle` : `familiar_${id}_idle_left`;
}

export function idleAnimKey(id: string, facing: 'right' | 'left'): string {
  return idleTextureKey(id, facing);
}

export function effectAnimKey(effectId: string): string {
  return `effect_${effectId}`;
}
