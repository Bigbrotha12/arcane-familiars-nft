// Guided first battle hint card. Mirrors TipCard's styling and placement
// (bottom-left over the battle log, or below the canvas on tall phones) but
// carries the guide's step title, a "Got it" dismiss and a "Skip guide" exit.
// Non-blocking: it captures clicks only on its own buttons.

import Button from '@/components/ui/Button';
import type { GuidedHint } from './guidedBattle';

interface GuidedHintCardProps {
  hint: GuidedHint | null;
  /** Battle cards sit bottom-left over the battle log (same as TipCard). */
  battle?: boolean;
  /** Explicit position (container pixels), copied from GamePage's TipCard. */
  anchor?: { top: number; left: number; width: number };
  onGotIt: () => void;
  onSkip: () => void;
}

export default function GuidedHintCard({ hint, battle = false, anchor, onGotIt, onSkip }: GuidedHintCardProps) {
  if (!hint) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Battle guide"
      className={
        anchor
          ? 'pointer-events-auto absolute z-30'
          : `pointer-events-auto absolute z-30 w-[calc(100%-1.5rem)] max-w-[320px] ${
              battle ? 'bottom-3 left-3' : 'right-3 top-3'
            }`
      }
      style={anchor}
    >
      <div className="tip-in hud-frame rounded-md p-2 sm:p-3">
        <h2 className="font-display text-[13px] font-semibold leading-tight text-pink sm:text-sm">{hint.title}</h2>
        <p className="mt-0.5 font-body text-[11px] leading-snug text-[#F0EFFF] sm:mt-1 sm:text-xs sm:leading-relaxed">
          {hint.body}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 sm:mt-2 sm:gap-2">
          <Button variant="primary" size="sm" onClick={onGotIt} className="px-2.5 py-0.5 text-[11px] sm:px-3 sm:py-1">
            Got it
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="px-1.5 py-0.5 text-[11px] text-[#B8B5E0] hover:bg-[#3B3870] hover:text-[#F0EFFF] sm:px-2 sm:py-1"
          >
            Skip guide
          </Button>
        </div>
      </div>
    </aside>
  );
}
