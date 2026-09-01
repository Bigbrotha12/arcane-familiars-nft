// Encounter overlay: "A wild familiar appears!" + Fight/Flee buttons.
// Center overlay; interactive.

import Button from '@/components/ui/Button';

interface EncounterOverlayProps {
  onFight: () => void;
  onFlee: () => void;
}

function EncounterOverlay({ onFight, onFlee }: EncounterOverlayProps) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="hud-frame max-w-sm rounded-lg p-lg">
        <h2 className="mb-lg font-display text-xl font-bold text-[#F0EFFF]">A wild familiar appears!</h2>
        <div className="flex gap-3">
          <Button variant="primary" size="md" onClick={onFight}>
            Fight
          </Button>
          <Button variant="secondary" size="md" onClick={onFlee}>
            Flee
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EncounterOverlay;
