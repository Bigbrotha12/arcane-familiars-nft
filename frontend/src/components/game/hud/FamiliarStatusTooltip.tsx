// Tooltip-style design — small card with a pointer/arrow toward the sprite.
// Name at top, bars in middle, status icons at bottom.

import type { FamiliarState } from '@/game'

interface FamiliarStatusTooltipProps {
  familiar: FamiliarState
  position: 'above' | 'below'
  statusEffects?: Array<{ id: string; icon: string; duration?: number }>
}

function FamiliarStatusTooltip({ familiar, position, statusEffects = [] }: FamiliarStatusTooltipProps) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0
  const hpColor = hpRatio > 0.5 ? 'bg-teal' : hpRatio > 0.25 ? 'bg-warning' : 'bg-error'

  const isAbove = position === 'above'

  return (
    <div className={`pointer-events-none flex flex-col items-center ${isAbove ? 'flex-col' : 'flex-col-reverse'}`}>
      <div className="relative w-40 rounded-lg border border-[#3B3870] bg-[#1E1B4B]/90 px-2 py-1.5 shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate font-body text-[10px] font-semibold text-[#F0EFFF]">
            {familiar.name}
          </span>
          <div className="flex items-center gap-0.5">
            {statusEffects.slice(0, 4).map((effect) => (
              <span key={effect.id} className="text-[9px]" title={effect.id}>
                {effect.icon}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-1 space-y-0.5">
          <div className="flex items-center gap-1">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1A1A2E]">
              <div className={`h-full ${hpColor} rounded-full transition-all duration-300`} style={{ width: `${hpRatio * 100}%` }} />
            </div>
            <span className="font-mono text-[8px] tabular-nums text-[#B8B5E0]">
              {Math.max(0, Math.floor(familiar.hp))}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#1A1A2E]">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${mpRatio * 100}%` }} />
            </div>
            <span className="font-mono text-[8px] tabular-nums text-[#A5A3C4]">
              {Math.max(0, Math.floor(familiar.mp))}
            </span>
          </div>
        </div>

        <div
          className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-[#3B3870] bg-[#1E1B4B]/90 ${
            isAbove ? '-bottom-1 border-b border-r' : '-top-1 border-l border-t'
          }`}
        />
      </div>
    </div>
  )
}

export default FamiliarStatusTooltip
