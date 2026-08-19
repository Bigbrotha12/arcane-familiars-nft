// Compact floating card with name, HP/MP bars, and status effect icons.
// Positioned above enemy, below player. Semi-transparent background.

import type { FamiliarState } from '@/game'

interface FamiliarStatusCompactProps {
  familiar: FamiliarState
  position: 'above' | 'below'
  statusEffects?: Array<{ id: string; icon: string; duration?: number }>
}

function FamiliarStatusCompact({ familiar, position, statusEffects = [] }: FamiliarStatusCompactProps) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0
  const hpColor = hpRatio > 0.5 ? 'bg-teal' : hpRatio > 0.25 ? 'bg-warning' : 'bg-error'

  return (
    <div
      className={`pointer-events-none flex w-48 flex-col gap-1 rounded-md border border-[#3B3870] bg-[#1E1B4B]/85 px-2 py-1.5 shadow-lg backdrop-blur-sm ${
        position === 'above' ? 'flex-col' : 'flex-col-reverse'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-body text-xs font-semibold text-[#F0EFFF]">
          {familiar.name}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] font-medium text-teal">HP</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-[2px] border border-[#2A2A45] bg-[#1A1A2E]">
          <div className={`h-full ${hpColor} transition-all duration-300`} style={{ width: `${hpRatio * 100}%` }} />
        </div>
        <span className="font-mono text-[9px] tabular-nums text-[#B8B5E0]">
          {Math.max(0, Math.floor(familiar.hp))}/{familiar.maxHp}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] font-medium text-accent">MP</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-[2px] border border-[#2A2A45] bg-[#1A1A2E]">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${mpRatio * 100}%` }} />
        </div>
        <span className="font-mono text-[9px] tabular-nums text-[#B8B5E0]">
          {Math.max(0, Math.floor(familiar.mp))}/{familiar.maxMp}
        </span>
      </div>

      {statusEffects.length > 0 && (
        <div className="flex items-center gap-0.5 border-t border-[#3B3870] pt-1">
          {statusEffects.map((effect) => (
            <div
              key={effect.id}
              className="relative flex h-5 w-5 items-center justify-center rounded-sm bg-[#2D2A5E] text-[10px]"
              title={effect.id}
            >
              {effect.icon}
              {effect.duration !== undefined && (
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#1E1B4B] px-0.5 font-mono text-[7px] text-[#A5A3C4]">
                  {effect.duration}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FamiliarStatusCompact
