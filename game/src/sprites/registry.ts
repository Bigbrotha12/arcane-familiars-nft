// Data-driven sprite registry. Adding a familiar's art = one FAMILIAR_SPRITES
// entry (+ asset files); no other code changes.
//
// Key conventions (derived here — never hardcode keys at call sites):
// - Portrait texture:      `familiar_<id>`                    (familiarTextureKey)
// - Idle sheet texture:    `familiar_<id>_idle[_left]`        (idleTextureKey)
// - Idle animation key:    identical to the idle texture key  (idleAnimKey — anim and
//   texture share the key by convention; per-familiar because frame counts differ)
// - Effect texture + anim: `effect_<effectId>`                (effectAnimKey — also shared)

import type Phaser from 'phaser';
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

/** DESIGN.md palette colours per affinity (also used by the party-select chips). */
export const AFFINITY_COLORS: Record<string, number> = {
  Fire: 0xf59e0b,
  Water: 0x2dd4bf,
  Earth: 0x10b981,
  Wind: 0xa5a3c4,
  Light: 0xfbbf24,
  Dark: 0x7c5cfc,
};

const PLACEHOLDER_SIZE = 256; // matches the portrait spec

function cssColor(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface PlaceholderTextures {
  exists: (key: string) => boolean;
  createCanvas: (key: string, width: number, height: number) => Phaser.Textures.CanvasTexture | null;
}

/**
 * Draw (once) a stand-in portrait for a familiar without art: a disc in its
 * affinity colour with the species initial, matching the codex placeholder.
 * Never borrows another familiar's portrait, so species stay distinguishable.
 */
function ensurePlaceholderTexture(textures: PlaceholderTextures, id: string): string | null {
  const key = `familiar_placeholder_${id}`;
  if (textures.exists(key)) return key;
  const canvasTexture = textures.createCanvas(key, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
  if (!canvasTexture) return null;

  const familiar = getFamiliar(id);
  const color = AFFINITY_COLORS[Affinity[familiar?.affinity ?? Affinity.Light]] ?? 0xa5a3c4;
  const initial = (familiar?.name ?? id).charAt(0).toUpperCase();
  const ctx = canvasTexture.getContext();
  const c = PLACEHOLDER_SIZE / 2;

  ctx.clearRect(0, 0, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
  const glow = ctx.createRadialGradient(c, c * 0.8, 10, c, c, c * 0.86);
  glow.addColorStop(0, cssColor(color, 0.45));
  glow.addColorStop(1, cssColor(color, 0.12));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = cssColor(color, 0.9);
  ctx.stroke();

  ctx.fillStyle = cssColor(color, 1);
  ctx.font = '600 120px Fredoka, "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, c, c + 6);
  canvasTexture.refresh();
  return key;
}

/**
 * Portrait key for a familiar. Familiars without art get a generated
 * affinity-coloured placeholder (see ensurePlaceholderTexture); a whiteDog
 * portrait is the last resort if a canvas texture cannot be created.
 */
export function safeFamiliarTextureKey(scene: { textures: PlaceholderTextures }, id: string): string {
  const key = familiarTextureKey(id);
  if (scene.textures.exists(key)) return key;
  return ensurePlaceholderTexture(scene.textures, id) ?? familiarTextureKey(PLACEHOLDER_FAMILIAR_ID);
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
