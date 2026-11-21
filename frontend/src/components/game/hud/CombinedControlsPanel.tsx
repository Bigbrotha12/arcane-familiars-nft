// Combined bottom control panel: one framed panel holding the action bar, log
// and party arcs. Row 1: actions. Row 2: log (left) / party arcs (right),
// split by a thin divider. Using a single frame keeps the bottom chrome light.

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
    // Height follows the content (action bar + party rings) so nothing is
    // clipped at any canvas size; the 46% cap is only a guard for very short
    // canvases, where the party panel would otherwise cover the whole scene.
    <div className="pointer-events-none absolute bottom-3 left-4 right-4 z-10 max-h-[46%] overflow-hidden">
      <div className="hud-frame pointer-events-auto flex h-full flex-col rounded-md">
        {/* Row 1 — action buttons */}
        <ActionBar items={actions} />

        <div className="w-full shrink-0 border-t border-white/10" />

        {/* Row 2 — log (75%) + party arcs (25%) */}
        <div className="flex min-h-0 flex-1">
          {/* The log body and label are sized for the desktop canvas; phone
              canvases are half scale, so bump them back to readable type. */}
          <div className="flex w-3/4 min-w-0 flex-col p-2 max-sm:[&_p]:text-[20px] max-sm:[&_span]:text-[15px]">
            <div className="flex flex-1 flex-col overflow-hidden [&>div]:flex-1">
              <BattleLog entries={logEntries} />
            </div>
          </div>
          <div className="shrink-0 self-stretch border-l border-white/10" />
          <div className="flex w-1/4 shrink-0 items-center justify-center p-1.5">
            <CircularArcPartyPanel party={party} activeId={activeId} onSwapClick={onSwapClick} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default CombinedControlsPanel;
export { CombinedControlsPanel };
