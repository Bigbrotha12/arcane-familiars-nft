// Player party familiar cards (compact HP bar + MP readout per member) with the
// active familiar ringed in accent. Non-interactive chrome.

import type { FamiliarState } from '@/game';

interface PartyPanelProps {
  party: FamiliarState[];
  activeId?: string;
}

function PartyPanel({ party, activeId }: PartyPanelProps) {
  if (!party.length) return null;

  const resolvedActiveId = activeId ?? party[0].id;

  return (
    <div className="hud-frame pointer-events-none flex w-56 flex-col gap-2 rounded-md p-md">
      {party.map((familiar) => {
        const isActive = familiar.id === resolvedActiveId;
        const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0;
        const fillColor = hpRatio > 0.5 ? 'bg-teal' : hpRatio > 0.25 ? 'bg-warning' : 'bg-error';

        return (
          <div
            key={familiar.id}
            className={`rounded-sm p-1.5 transition-all ${isActive ? 'bg-accent/10 ring-1 ring-accent' : ''}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className={`truncate font-body text-xs font-medium ${isActive ? 'text-[#F0EFFF]' : 'text-[#B8B5E0]'}`}
              >
                {familiar.name}
              </span>
              {isActive && (
                <span className="font-display text-[9px] font-semibold uppercase tracking-wider text-accent-light">
                  Active
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <div className="h-2 w-20 overflow-hidden rounded-[3px] border border-[#2A2A45] bg-[#1A1A2E]">
                <div
                  className={`h-full ${fillColor} transition-all duration-300`}
                  style={{ width: `${hpRatio * 100}%` }}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-[#B8B5E0]">
                {Math.max(0, Math.floor(familiar.hp))}/{Math.max(0, familiar.maxHp)}
              </span>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-[#6366A1]">
                MP {Math.max(0, Math.floor(familiar.mp))}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PartyPanel;
