// Boss overlay: "⚠ BOSS ROOM AHEAD" + bestiary details + Enter/Retreat.
// Center overlay; interactive. Retreat is kept: exploration bosses can be
// avoided (only the battle itself forfeits run loot). Enter = Enter.

import { useEffect } from 'react';
import Button from '@/components/ui/Button';
import { isModalOpen } from '@/components/ui/Modal';
import EncounterDetails from './EncounterDetails';
import type { EncounterSnapshot, FamiliarState } from '@/game';

interface BossOverlayProps {
  onEnter: () => void;
  onRetreat: () => void;
  encounter?: EncounterSnapshot;
  party?: FamiliarState[];
  activeId?: string;
}

function BossOverlay({ onEnter, onRetreat, encounter, party, activeId }: BossOverlayProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog above this overlay (exit modal) owns the keyboard while open.
      if (isModalOpen()) return;
      const onButton = (event.target as HTMLElement | null)?.tagName === 'BUTTON';
      if (event.key === 'Enter' && !onButton) {
        event.preventDefault();
        onEnter();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onRetreat();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEnter, onRetreat]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="boss-overlay-title"
        className="hud-frame max-w-sm rounded-lg p-lg max-sm:max-w-[620px] max-sm:p-xl"
      >
        <h2
          id="boss-overlay-title"
          className="mb-md font-display text-xl font-bold text-error max-sm:mb-lg max-sm:text-[32px]"
        >
          ⚠ BOSS ROOM AHEAD
        </h2>

        {encounter && <EncounterDetails encounter={encounter} party={party} activeId={activeId} />}

        <div className="mt-lg flex gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={onEnter}
            autoFocus
            className="max-sm:px-7 max-sm:py-3 max-sm:text-[24px]"
          >
            Enter
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onRetreat}
            className="max-sm:px-7 max-sm:py-3 max-sm:text-[24px]"
          >
            Retreat
          </Button>
        </div>
      </div>
    </div>
  );
}

export default BossOverlay;
