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
 * itself; repeat calls during a fade-out are ignored, so callers can never
 * queue two transitions (which would start the destination scene twice).
 * A call during the scene's own fade-in is deferred until it completes.
 */
export function fadeToScene(scene: Phaser.Scene, key: string, data?: object): void {
  const camera = scene.cameras?.main;
  if (!camera || prefersReducedMotion()) {
    scene.scene.start(key, data);
    return;
  }
  const fade = camera.fadeEffect;
  if (fade?.isRunning) {
    // A running fade-out is a transition already under way: ignore repeats.
    if (fade.direction) return;
    // A fade-in is just this scene appearing. A transition requested now (e.g.
    // resuming a battle as soon as bootstrap returns) must not be dropped, or
    // the player is stranded: run it once the fade-in finishes.
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => fadeToScene(scene, key, data));
    return;
  }

  camera.fadeOut(FADE_MS, 0, 0, 0);
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });
}
