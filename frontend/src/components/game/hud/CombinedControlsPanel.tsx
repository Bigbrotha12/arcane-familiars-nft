// Combined bottom control panel: action bar + log + party panel in one container.
// Row 1: action bar (full width).
// Row 2: two columns — left 75% = log box, right 25% = party panel.

import type { FamiliarState } from '@/game';
import ActionBar, { type ActionBarItem } from './ActionBar';
import BattleLog from './BattleLog';
import CircularArcPartyPanel from './CircularArcPartyPanel';

interface CombinedControlsPanelProps {
  actions: ActionBarItem[];
  logEntries: string[];
  party: FamiliarState[];
  activeId?: string;
  onSwapClick?: (familiarId: string) => void;
}

function CombinedControlsPanel({ actions, logEntries, party, activeId, onSwapClick }: CombinedControlsPanelProps) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10">
      <div className="flex flex-col gap-1">
        {/* Row 1 — action bar */}
        <ActionBar items={actions} />

        {/* Row 2 — log (75%) + party (25%) */}
        <div className="flex min-h-[104px] rounded-md border-4 border-double border-[#3B3870] bg-[#1E1B4B]/85">
          <div className="flex w-3/4 flex-col p-sm">
            <div className="flex flex-1 flex-col [&>div]:flex-1">
              <BattleLog entries={logEntries} />
            </div>
          </div>
          <div className="relative w-1/4 p-1.5">
            {/* Partial vertical separator */}
            <div className="absolute top-3 bottom-3 left-0 w-[3px] border-l-2 border-double border-[#3B3870]" />
            <div className="flex h-full items-center justify-center">
              <CircularArcPartyPanel party={party} activeId={activeId} onSwapClick={onSwapClick} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CombinedControlsPanel;
export { CombinedControlsPanel };
