// Compact combatant card with name, HP/MP bars, and status effect icons.
// Solid background with double-lined border. Same layout for enemy and player.

import type { FamiliarState } from '@/game';

interface FamiliarStatusCompactProps {
  familiar: FamiliarState;
  isBoss?: boolean;
  statusEffects?: Array<{ id: string; icon: string; duration?: number }>;
}

const MAX_STATUS_SLOTS = 10;

function FamiliarStatusCompact({ familiar, isBoss = false, statusEffects = [] }: FamiliarStatusCompactProps) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0;
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0;
  const hpColor = hpRatio > 0.5 ? 'bg-teal' : hpRatio > 0.25 ? 'bg-warning' : 'bg-error';

  return (
    <div className="pointer-events-none flex w-[240px] flex-col gap-1 rounded-md border-4 border-double border-[#3B3870] bg-[#1E1B4B] px-2 py-1.5 shadow-lg">
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate font-body text-sm font-semibold text-[#F0EFFF]">{familiar.name}</span>
        {isBoss && (
          <span className="shrink-0 rounded-sm bg-error/20 px-1.5 py-px font-display text-[10px] font-semibold uppercase tracking-wider text-error">
            Boss
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-medium text-teal">HP</span>
        <div className="h-[6px] flex-1 overflow-hidden rounded-sm border border-[#2A2A45] bg-[#1A1A2E]">
          <div className={`h-full ${hpColor} transition-all duration-300`} style={{ width: `${hpRatio * 100}%` }} />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[#B8B5E0]">
          {Math.max(0, Math.floor(familiar.hp))}/{familiar.maxHp}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-medium text-accent">MP</span>
        <div className="h-[6px] flex-1 overflow-hidden rounded-sm border border-[#2A2A45] bg-[#1A1A2E]">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${mpRatio * 100}%` }} />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[#B8B5E0]">
          {Math.max(0, Math.floor(familiar.mp))}/{familiar.maxMp}
        </span>
      </div>

      <div className="grid grid-cols-10 gap-0.5 border-t-2 border-[#3B3870] pt-1">
        {Array.from({ length: MAX_STATUS_SLOTS }).map((_, i) => {
          const effect = statusEffects[i];
          return (
            <div key={effect?.id ?? `empty-${i}`} className="relative flex h-[18px] w-full items-center justify-center">
              {effect && (
                <>
                  <div className="flex h-full w-full items-center justify-center rounded-md bg-[#2D2A5E] text-[11px]">
                    {effect.icon}
                  </div>
                  {effect.duration !== undefined && (
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#1E1B4B] px-0.5 font-mono text-[8px] text-[#A5A3C4]">
                      {effect.duration}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FamiliarStatusCompact;
