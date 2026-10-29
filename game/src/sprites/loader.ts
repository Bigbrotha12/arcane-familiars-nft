import type Phaser from 'phaser';
import { FAMILIARS } from '@arcane-familiars/game-logic';
import {
  EFFECT_SPRITES,
  FAMILIAR_SPRITES,
  effectAnimKey,
  familiarTextureKey,
  idleAnimKey,
  idleTextureKey,
  type SpriteSheetConfig,
} from './registry';

const PORTRAIT_BASE = '/assets/sprites/familiars';
const SPRITES_BASE = '/assets/sprites';

// Inserts `_left` before the file extension: `idle/x_idle.png` -> `idle/x_idle_left.png`.
// A familiar without a left sheet on disk only logs a loader 404 warning in the
// console; the enemy side then gracefully falls back to its static portrait.
function leftVariantPath(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot === -1 ? `${file}_left` : `${file.slice(0, dot)}_left${file.slice(dot)}`;
}

function loadSheet(scene: Phaser.Scene, key: string, url: string, config: SpriteSheetConfig): void {
  scene.load.spritesheet(key, url, { frameWidth: config.frameWidth, frameHeight: config.frameHeight });
}

export function preloadFamiliarPortraits(scene: Phaser.Scene): void {
  for (const id of Object.keys(FAMILIARS)) {
    scene.load.image(familiarTextureKey(id), `${PORTRAIT_BASE}/${id}/${id}_portrait.png`);
  }
}

export function preloadFamiliarAssets(scene: Phaser.Scene): void {
  preloadFamiliarPortraits(scene);
  for (const [id, config] of Object.entries(FAMILIAR_SPRITES)) {
    if (!config || !config.idle) continue;
    const base = `${PORTRAIT_BASE}/${id}`;
    loadSheet(scene, idleTextureKey(id, 'right'), `${base}/${config.idle.file}`, config.idle);
    if (config.left !== false) {
      loadSheet(scene, idleTextureKey(id, 'left'), `${base}/${leftVariantPath(config.idle.file)}`, config.idle);
    }
  }
  for (const [effectId, config] of Object.entries(EFFECT_SPRITES)) {
    loadSheet(scene, effectAnimKey(effectId), `${SPRITES_BASE}/${config.file}`, config);
  }
}

export function createFamiliarAnimations(scene: Phaser.Scene): void {
  for (const [id, config] of Object.entries(FAMILIAR_SPRITES)) {
    if (!config || !config.idle) continue;
    createSheetAnimation(scene, idleAnimKey(id, 'right'), config.idle, -1);
    createSheetAnimation(scene, idleAnimKey(id, 'left'), config.idle, -1);
  }
  for (const [effectId, config] of Object.entries(EFFECT_SPRITES)) {
    createSheetAnimation(scene, effectAnimKey(effectId), config, 0);
  }
}

// frameTotal counts the __BASE frame, so the last animation frame is frameTotal - 2.
// Deriving the range from the loaded texture covers per-familiar frame counts
// (49 vs 12 vs 25) without hardcoding.
function createSheetAnimation(scene: Phaser.Scene, key: string, config: SpriteSheetConfig, repeat: number): void {
  if (!scene.textures.exists(key) || scene.anims.exists(key)) return;
  if (scene.textures.get(key).frameTotal < 2) return;
  scene.anims.create({
    key,
    frames: scene.anims.generateFrameNumbers(key, {
      start: 0,
      end: Math.max(0, scene.textures.get(key).frameTotal - 2),
    }),
    frameRate: config.frameRate,
    repeat,
  });
}
