import Phaser from 'phaser';

export const DESIGN_WIDTH = 800;
export const DESIGN_HEIGHT = 600;

/**
 * Maps the fixed 800x600 "design space" onto the live game canvas so the UI
 * stays proportionally correct at any window size, aspect ratio, or DPI.
 *
 * The design space is scaled uniformly to fit inside the canvas (never
 * stretched), and any leftover space is letterboxed around it. Every position,
 * size, and font size that was authored for the 800x600 layout should pass
 * through this class instead of using raw canvas coordinates.
 */
export class Layout {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;

  constructor(scene: Phaser.Scene) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    this.scale = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);
    this.offsetX = (w - DESIGN_WIDTH * this.scale) / 2;
    this.offsetY = (h - DESIGN_HEIGHT * this.scale) / 2;
  }

  /** Design-space X coordinate -> canvas X coordinate. */
  x(dx: number): number {
    return this.offsetX + dx * this.scale;
  }

  /** Design-space Y coordinate -> canvas Y coordinate. */
  y(dy: number): number {
    return this.offsetY + dy * this.scale;
  }

  /** Design-space length (width / height / radius / offset) -> canvas length. */
  s(d: number): number {
    return d * this.scale;
  }

  /** Design-space px font size -> canvas CSS font size string. */
  font(size: number): string {
    return `${Math.round(size * this.scale)}px`;
  }
}
