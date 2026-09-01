// Tracks the rendered Phaser canvas bounding box within its container. The
// canvas is Scale.FIT-centered, so it letterboxes inside the container; HUD
// overlays anchored to the container edges can drift above/outside the canvas
// (e.g. under the toolbar). This hook returns the canvas offset+size relative
// to the container so overlays can be aligned to the actual canvas bounds.

import { useEffect, useState, type RefObject } from 'react';

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function useCanvasRect(containerRef: RefObject<HTMLDivElement | null>, refreshKey?: unknown): CanvasRect | null {
  const [rect, setRect] = useState<CanvasRect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let canvas: HTMLCanvasElement | null = null;
    let canvasObserver: ResizeObserver | null = null;

    const measure = () => {
      if (!canvas || !canvas.isConnected) {
        canvas = container.querySelector('canvas');
        if (!canvas) return;
        canvasObserver?.disconnect();
        canvasObserver = new ResizeObserver(measure);
        canvasObserver.observe(canvas);
      }

      const cRect = container.getBoundingClientRect();
      const elRect = canvas.getBoundingClientRect();
      setRect({
        left: elRect.left - cRect.left,
        top: elRect.top - cRect.top,
        width: elRect.width,
        height: elRect.height,
      });
    };

    const containerObserver = new ResizeObserver(measure);
    containerObserver.observe(container);

    // The canvas is created asynchronously by Phaser after mount; watch for it.
    const mutationObserver = new MutationObserver(() => {
      if (!canvas || !canvas.isConnected) measure();
    });
    mutationObserver.observe(container, { childList: true, subtree: true });

    measure();

    return () => {
      containerObserver.disconnect();
      mutationObserver.disconnect();
      canvasObserver?.disconnect();
    };
  }, [containerRef, refreshKey]);

  return rect;
}
