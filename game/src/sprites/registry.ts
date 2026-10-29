// Data-driven sprite registry. Adding a familiar's art = one FAMILIAR_SPRITES
// entry (+ asset files); no other code changes.
//
// Key conventions (derived here — never hardcode keys at call sites):
// - Portrait texture:      `familiar_<id>`                    (familiarTextureKey)
// - Idle sheet texture:    `familiar_<id>_idle[_left]`        (idleTextureKey)
// - Idle animation key:    identical to the idle texture key  (idleAnimKey — anim and
//   texture share the key by convention; per-familiar because frame counts differ)
// - Effect texture + anim: `effect_<effectId>`                (effectAnimKey — also shared)

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

export function getFamiliarSprites(id: string): FamiliarSpriteConfig | undefined {
  return FAMILIAR_SPRITES[id];
}

export function familiarTextureKey(id: string): string {
  return `familiar_${id}`;
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
