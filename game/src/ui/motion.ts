/**
 * Motion primitives shared by every scene.
 *
 * DESIGN.md motion scale: micro 50-100ms, short 150-250ms, medium 250-400ms,
 * long 400-700ms. Enter uses ease-out, exit ease-in, movement ease-in-out.
 *
 * `prefersReducedMotion()` gates every decorative animation (shakes, lunges,
 * particles, bobs). State changes still apply instantly when it is set, so the
 * game remains fully playable without motion.
 */

export const MOTION = {
  micro: 80,
  short: 200,
  medium: 320,
  long: 560,
  /** Battle turn playback pacing (two steps stay under ~1.4s total). */
  stepDelay: 600,
  outcomeDelay: 650,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Duration helper: returns 0 under reduced motion so callers can no-op. */
export function motionDuration(duration: number): number {
  return prefersReducedMotion() ? 0 : duration;
}
