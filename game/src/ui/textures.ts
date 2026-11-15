import Phaser from 'phaser';

/**
 * Battle VFX textures, drawn with Graphics at runtime and baked with
 * `generateTexture`. No image assets are shipped for these (art has its own
 * generation pipeline); everything here is code.
 *
 * Keys are global to the Phaser texture manager, so generation is idempotent
 * and safe to call from any scene.
 */
export const FX = {
  ring: 'fx_battle_ring',
  glow: 'fx_battle_glow',
  spark: 'fx_battle_spark',
  chevron: 'fx_battle_chevron',
  dot: 'fx_battle_dot',
} as const;

type TextureDrawer = (graphics: Phaser.GameObjects.Graphics) => { width: number; height: number };

const DRAWERS: Record<string, TextureDrawer> = {
  [FX.ring]: (g) => {
    g.lineStyle(6, 0xffffff, 1);
    g.strokeCircle(64, 64, 56);
    g.lineStyle(2, 0xffffff, 0.45);
    g.strokeCircle(64, 64, 46);
    return { width: 128, height: 128 };
  },
  [FX.glow]: (g) => {
    // Stacked translucent discs approximate a soft radial falloff without a
    // shader: the centre accumulates alpha, the edge stays faint.
    for (let ring = 10; ring >= 1; ring--) {
      g.fillStyle(0xffffff, 0.055);
      g.fillCircle(64, 64, (64 * ring) / 10);
    }
    return { width: 128, height: 128 };
  },
  [FX.spark]: (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(8, 0),
        new Phaser.Math.Vector2(10, 6),
        new Phaser.Math.Vector2(16, 8),
        new Phaser.Math.Vector2(10, 10),
        new Phaser.Math.Vector2(8, 16),
        new Phaser.Math.Vector2(6, 10),
        new Phaser.Math.Vector2(0, 8),
        new Phaser.Math.Vector2(6, 6),
      ],
      true
    );
    return { width: 16, height: 16 };
  },
  [FX.chevron]: (g) => {
    g.lineStyle(7, 0xffffff, 1);
    g.beginPath();
    g.moveTo(4, 28);
    g.lineTo(24, 8);
    g.lineTo(44, 28);
    g.strokePath();
    return { width: 48, height: 36 };
  },
  [FX.dot]: (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    return { width: 8, height: 8 };
  },
};

/** Bake every battle VFX texture that is not already in the texture manager. */
export function ensureBattleTextures(scene: Phaser.Scene): void {
  for (const [key, draw] of Object.entries(DRAWERS)) {
    if (scene.textures.exists(key)) continue;
    const graphics = scene.make.graphics({}, false);
    const { width, height } = draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
