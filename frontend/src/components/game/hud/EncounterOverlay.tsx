// Encounter overlay: enemy identity/level/affinity/matchup + Fight/Flee.
// Center overlay; interactive. Enter = Fight, Escape = Flee (when allowed).

import { useEffect } from 'react';
import Button from '@/components/ui/Button';
import { isModalOpen } from '@/components/ui/Modal';
import EncounterDetails from './EncounterDetails';
import type { EncounterSnapshot, FamiliarState } from '@/game';

interface EncounterOverlayProps {
  onFight: () => void;
  onFlee: () => void;
  encounter?: EncounterSnapshot;
  party?: FamiliarState[];
  activeId?: string;
  /** Bosses (or any non-fleeable encounter) hide the Flee button. */
  canFlee?: boolean;
  recruitBond?: Record<string, number>;
  ownedFamiliars?: string[];
}

function EncounterOverlay({
  onFight,
  onFlee,
  encounter,
  party,
  activeId,
  canFlee = true,
  recruitBond,
  ownedFamiliars,
}: EncounterOverlayProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A focused button already handles Enter itself; the global shortcut is
      // for when focus is elsewhere on the overlay.
      // A dialog above this overlay (exit modal) owns the keyboard while open.
      if (isModalOpen()) return;
      const onButton = (event.target as HTMLElement | null)?.tagName === 'BUTTON';
      if (event.key === 'Enter' && !onButton) {
        event.preventDefault();
        onFight();
      } else if (event.key === 'Escape' && canFlee) {
        event.preventDefault();
        onFlee();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onFight, onFlee, canFlee]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="encounter-overlay-title"
        className="hud-frame max-w-sm rounded-lg p-lg max-sm:max-w-[620px] max-sm:p-xl"
      >
        <h2
          id="encounter-overlay-title"
          className="mb-md font-display text-xl font-bold text-[#F0EFFF] max-sm:mb-lg max-sm:text-[32px]"
        >
          A wild familiar appears!
        </h2>

        {encounter && (
          <EncounterDetails
            encounter={encounter}
            party={party}
            activeId={activeId}
            recruitBond={recruitBond}
            ownedFamiliars={ownedFamiliars}
          />
        )}

        <div className="mt-lg flex gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={onFight}
            autoFocus
            className="max-sm:px-7 max-sm:py-3 max-sm:text-[24px]"
          >
            Fight
          </Button>
          {canFlee && (
            <Button
              variant="secondary"
              size="md"
              onClick={onFlee}
              className="max-sm:px-7 max-sm:py-3 max-sm:text-[24px]"
            >
              Flee
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EncounterOverlay;
