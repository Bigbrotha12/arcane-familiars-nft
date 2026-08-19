import Phaser from 'phaser';
import { Layout } from './layout';
import { C } from './theme';

/**
 * Shared design-space background layer for the battle and exploration scenes.
 *
 * Owns the full-canvas fallback backdrop, the background image, and the
 * tint/darkening overlay. The image is always sized to the 800x600 design
 * space via Layout, so switching scenes (battle <-> exploration) never changes
 * the apparent image size, and edits to either scene cannot drift the sizing.
 *
 * Depth: the whole layer sits at depth -1, below all scene UI, so insertion
 * order never matters.
 */
export class SceneBackground {
  private scene: Phaser.Scene;
  private layout: Layout;
  private container: Phaser.GameObjects.Container;
  private image?: Phaser.GameObjects.Image;
  private overlay?: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, layout: Layout) {
    this.scene = scene;
    this.layout = layout;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(-1);

    const fallback = scene.add.rectangle(
      scene.scale.width / 2,
      scene.scale.height / 2,
      scene.scale.width,
      scene.scale.height,
      C.bg,
    );
    this.container.add(fallback);
  }

  /** Swap the background image; always re-applies the design-space size. */
  setImage(key: string): void {
    if (!this.scene.textures.exists(key)) return;
    if (!this.image) {
      this.image = this.scene.add.image(this.layout.x(400), this.layout.y(300), key);
      this.image.setOrigin(0.5);
      this.container.add(this.image);
    }
    this.image.setTexture(key);
    this.image.setDisplaySize(this.layout.s(800), this.layout.s(600));
  }

  /** Set the tint/darkening overlay (also sized to the design space). */
  setOverlay(color: number, alpha: number): void {
    if (!this.overlay) {
      this.overlay = this.scene.add.rectangle(
        this.layout.x(400),
        this.layout.y(300),
        this.layout.s(800),
        this.layout.s(600),
        color,
        alpha,
      );
      this.overlay.setOrigin(0.5);
      this.container.add(this.overlay);
    } else {
      this.overlay.setFillStyle(color, alpha);
    }
  }

  setVisible(enabled: boolean): void {
    this.container.setVisible(enabled);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}