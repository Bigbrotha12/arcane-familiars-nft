import { DESIGN_WIDTH, DESIGN_HEIGHT } from './layout';

/** Cap the supersample so a 4K retina display does not allocate a huge canvas. */
const MAX_SCALE = 3;
const MAX_DPR = 2;

export interface CanvasSize {
  width: number;
  height: number;
  /** Integer multiple of the 800x600 design space the backing store renders at. */
  scale: number;
}

/**
 * Pick the canvas backing-store size for the game.
 *
 * The design space is a fixed 800x600 (Layout maps it onto whatever the canvas
 * is), and Phaser's Scale.FIT shrinks the canvas element to the container via
 * CSS. Upscaling a 800x600 backing store is what made canvas text blurry, so we
 * render the same 4:3 design space at the largest integer multiple that covers
 * the container's real pixels (CSS px x devicePixelRatio, DPR capped at 2).
 *
 * The aspect ratio is deliberately unchanged: FIT therefore lays the canvas out
 * exactly as before (same CSS box, so the React HUD overlay still lines up),
 * while the extra backing pixels are only ever downscaled by the browser.
 * Because the multiple is fixed for the lifetime of the game, resizing the
 * window keeps working through FIT without invalidating placed objects.
 */
export function computeCanvasSize(container: HTMLElement | null): CanvasSize {
  if (!container || typeof window === 'undefined') {
    return { width: DESIGN_WIDTH, height: DESIGN_HEIGHT, scale: 1 };
  }

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const cssWidth = container.clientWidth || DESIGN_WIDTH;
  const cssHeight = container.clientHeight || DESIGN_HEIGHT;

  const needed = Math.min((cssWidth * dpr) / DESIGN_WIDTH, (cssHeight * dpr) / DESIGN_HEIGHT);
  const scale = Math.max(1, Math.min(MAX_SCALE, Math.ceil(needed)));

  return { width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale, scale };
}
