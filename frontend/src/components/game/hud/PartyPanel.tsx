// Player party familiar cards (compact HP/MP bars per member) with the active
// familiar ringed in accent. Anchored bottom-left; non-interactive chrome.

import StatBar from './StatBar'
import type { FamiliarState } from '@/game'

interface PartyPanelProps {
  party: FamiliarState[]
  activeId?: string
}

function PartyPanel({ party, activeId }: PartyPanelProps) {
  if (!party.length) return null

  const resolvedActiveId = activeId ?? party[0].id

  return (
    <div className="pointer-events-none flex w-56 flex-col gap-2 rounded-md bg-[#1E1B4B]/85 p-md shadow-card backdrop-blur-sm">
      {party.map((familiar) => {
        const isActive = familiar.id === resolvedActiveId
        return (
          <div
            key={familiar.id}
            className={`rounded-sm p-sm transition-all ${isActive ? 'bg-accent/10 ring-2 ring-accent' : ''}`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className={`truncate font-body text-sm font-medium ${
                  isActive ? 'text-[#F0EFFF]' : 'text-[#B8B5E0]'
                }`}
              >
                {familiar.name}
              </span>
              {isActive && (
                <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-accent-light">
                  Active
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <StatBar label="HP" current={familiar.hp} max={familiar.maxHp} kind="hp" />
              <StatBar label="MP" current={familiar.mp} max={familiar.maxMp} kind="mp" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PartyPanel
