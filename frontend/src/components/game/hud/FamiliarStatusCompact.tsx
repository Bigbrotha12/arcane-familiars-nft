// Compact combatant card with name, HP/MP bars, and status effect icons.
// Solid background with double-lined border. Same layout for enemy and player.

import type { FamiliarState } from '@/game'

interface FamiliarStatusCompactProps {
  familiar: FamiliarState
  isBoss?: boolean
  statusEffects?: Array<{ id: string; icon: string; duration?: number }>
}

function FamiliarStatusCompact({ familiar, isBoss = false, statusEffects = [] }: FamiliarStatusCompactProps) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0
  const hpColor = hpRatio > 0.5 ? 'bg-teal' : hpRatio > 0.25 ? 'bg-warning' : 'bg-error'

  return (
    <div className="pointer-events-none flex w-96 flex-col gap-2 rounded-lg border-8 border-double border-[#3B3870] bg-[#1E1B4B] px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-body text-2xl font-semibold text-[#F0EFFF]">
          {familiar.name}
        </span>
        {isBoss && (
          <span className="shrink-0 rounded-md bg-error/20 px-3 py-1 font-display text-lg font-semibold uppercase tracking-wider text-error">
            Boss
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-medium text-teal">HP</span>
        <div className="h-3 flex-1 overflow-hidden rounded-sm border border-[#2A2A45] bg-[#1A1A2E]">
          <div className={`h-full ${hpColor} transition-all duration-300`} style={{ width: `${hpRatio * 100}%` }} />
        </div>
        <span className="font-mono text-lg tabular-nums text-[#B8B5E0]">
          {Math.max(0, Math.floor(familiar.hp))}/{familiar.maxHp}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-medium text-accent">MP</span>
        <div className="h-3 flex-1 overflow-hidden rounded-sm border border-[#2A2A45] bg-[#1A1A2E]">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${mpRatio * 100}%` }} />
        </div>
        <span className="font-mono text-lg tabular-nums text-[#B8B5E0]">
          {Math.max(0, Math.floor(familiar.mp))}/{familiar.maxMp}
        </span>
      </div>

      {statusEffects.length > 0 && (
        <div className="flex items-center gap-1 border-t-2 border-[#3B3870] pt-2">
          {statusEffects.map((effect) => (
            <div
              key={effect.id}
              className="relative flex h-10 w-10 items-center justify-center rounded-md bg-[#2D2A5E] text-xl"
              title={effect.id}
            >
              {effect.icon}
              {effect.duration !== undefined && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-[#1E1B4B] px-1 font-mono text-sm text-[#A5A3C4]">
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