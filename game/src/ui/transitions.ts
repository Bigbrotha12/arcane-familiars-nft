import Phaser from 'phaser';
import { prefersReducedMotion } from './motion';

/** DESIGN.md: page transitions are a subtle 250ms fade. */
const FADE_MS = 250;

/** Fade the scene in from black on create (no-op under reduced motion). */
export function fadeIn(scene: Phaser.Scene): void {
  if (prefersReducedMotion()) return;
  scene.cameras?.main?.fadeIn(FADE_MS, 0, 0, 0);
}

/**
 * Replace the active scene with a short fade instead of a hard cut.
 *
 * The fade is owned by the current scene's camera, so the busy flag resets by
 * itself; callers can never queue two transitions (which would start the
 * destination scene twice).
 */
export function fadeToScene(scene: Phaser.Scene, key: string, data?: object): void {
  const camera = scene.cameras?.main;
  if (!camera || prefersReducedMotion()) {
    scene.scene.start(key, data);
    return;
  }
  if (camera.fadeEffect?.isRunning) return;

  camera.fadeOut(FADE_MS, 0, 0, 0);
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });
}
