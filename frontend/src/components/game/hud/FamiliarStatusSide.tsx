// Side panel design — vertical HP/MP bars on the side of the sprite,
// status icons stacked vertically. Compact horizontally.

import type { FamiliarState } from '@/game'

interface FamiliarStatusSideProps {
  familiar: FamiliarState
  position: 'left' | 'right'
  statusEffects?: Array<{ id: string; icon: string; duration?: number }>
}

function FamiliarStatusSide({ familiar, position, statusEffects = [] }: FamiliarStatusSideProps) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0
  const hpColor = hpRatio > 0.5 ? 'bg-teal' : hpRatio > 0.25 ? 'bg-warning' : 'bg-error'

  return (
    <div
      className={`pointer-events-none flex items-end gap-1 ${
        position === 'left' ? 'flex-row' : 'flex-row-reverse'
      }`}
    >
      <div className="flex h-24 w-3 flex-col-reverse overflow-hidden rounded-full border border-[#3B3870] bg-[#1A1A2E]/80 shadow-md">
        <div className={`w-full ${hpColor} transition-all duration-300`} style={{ height: `${hpRatio * 100}%` }} />
        <div className="w-full bg-accent/80 transition-all duration-300" style={{ height: `${mpRatio * 100}%` }} />
      </div>

      <div className="flex flex-col items-start gap-0.5">
        <span className="max-w-16 truncate font-body text-[10px] font-semibold text-[#F0EFFF] drop-shadow-md">
          {familiar.name}
        </span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[8px] tabular-nums text-teal">
            {Math.max(0, Math.floor(familiar.hp))}/{familiar.maxHp}
          </span>
          <span className="font-mono text-[8px] tabular-nums text-[#A5A3C4]">
            {Math.max(0, Math.floor(familiar.mp))}
          </span>
        </div>
        {statusEffects.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {statusEffects.slice(0, 3).map((effect) => (
              <div
                key={effect.id}
                className="flex h-4 w-4 items-center justify-center rounded-sm bg-[#2D2A5E]/80 text-[9px] backdrop-blur-sm"
                title={effect.id}
              >
                {effect.icon}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FamiliarStatusSide
