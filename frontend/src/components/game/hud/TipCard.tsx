// Non-blocking first-time tip card. Rendered inside the canvas bounds, above
// the HUD, with no backdrop and no input capture beyond its own buttons.

import Button from '@/components/ui/Button';
import type { TipDefinition } from './tipRules';

interface TipCardProps {
  tip: TipDefinition | null;
  visible: boolean;
  /**
   * Battle cards sit bottom-left over the battle log, the only area that hides
   * neither combatant, their status cards nor the action bar. Other scenes
   * use the top-right corner (GamePage anchors it below the room card).
   */
  battle?: boolean;
  /**
   * Explicit position (container pixels). Used on tall, narrow screens where
   * the letterboxed canvas leaves room below it: the tip goes there and covers
   * nothing in the game.
   */
  anchor?: { top?: number; bottom?: number; left?: number; right?: number; width: number };
  onDismiss: () => void;
  onDisable: () => void;
}

export default function TipCard({ tip, visible, battle = false, anchor, onDismiss, onDisable }: TipCardProps) {
  if (!tip || !visible) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Tip"
      className={
        anchor
          ? 'pointer-events-auto absolute z-30'
          : `pointer-events-auto absolute z-30 w-[calc(100%-1.5rem)] max-w-[320px] ${
              battle ? 'bottom-3 left-3' : 'right-3 top-3'
            }`
      }
      style={anchor}
    >
      <div className="tip-in hud-frame rounded-md p-1.5 sm:p-2">
        <h2 className="font-display text-[13px] font-semibold leading-tight text-pink sm:text-sm">{tip.title}</h2>
        <p className="mt-0.5 font-body text-[11px] leading-snug text-[#F0EFFF] sm:mt-1 sm:text-xs sm:leading-relaxed">
          {tip.body}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 sm:mt-2 sm:gap-2">
          <Button variant="primary" size="sm" onClick={onDismiss} className="px-2.5 py-0.5 text-[11px] sm:px-3 sm:py-1">
            Got it
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDisable}
            className="px-1.5 py-0.5 text-[11px] text-[#B8B5E0] hover:bg-[#3B3870] hover:text-[#F0EFFF] sm:px-2 sm:py-1"
          >
            Turn off tips
          </Button>
        </div>
      </div>
    </aside>
  );
}
