// Minimal bars-only design with inline status icons.
// No card background — just floating bars near the sprite.

import type { FamiliarState } from '@/game';

interface FamiliarStatusMinimalProps {
  familiar: FamiliarState;
  position: 'above' | 'below';
  statusEffects?: Array<{ id: string; icon: string; duration?: number }>;
}

function FamiliarStatusMinimal({ familiar, position, statusEffects = [] }: FamiliarStatusMinimalProps) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0;
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0;
  const hpColor = hpRatio > 0.5 ? 'bg-teal' : hpRatio > 0.25 ? 'bg-warning' : 'bg-error';

  return (
    <div
      className={`pointer-events-none flex w-44 flex-col gap-0.5 ${
        position === 'above' ? 'flex-col' : 'flex-col-reverse'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate font-body text-[10px] font-medium text-[#F0EFFF] drop-shadow-md">
          {familiar.name}
        </span>
        <div className="flex items-center gap-0.5">
          {statusEffects.map((effect) => (
            <span key={effect.id} className="text-[10px] drop-shadow-md" title={effect.id}>
              {effect.icon}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-[#2A2A45]/50 bg-[#1A1A2E]/70 shadow-sm">
          <div
            className={`h-full ${hpColor} rounded-full transition-all duration-300`}
            style={{ width: `${hpRatio * 100}%` }}
          />
        </div>
        <span className="font-mono text-[9px] tabular-nums text-[#F0EFFF] drop-shadow-md">
          {Math.max(0, Math.floor(familiar.hp))}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-[#2A2A45]/50 bg-[#1A1A2E]/70 shadow-sm">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${mpRatio * 100}%` }}
          />
        </div>
        <span className="font-mono text-[9px] tabular-nums text-[#B8B5E0] drop-shadow-md">
          {Math.max(0, Math.floor(familiar.mp))}
        </span>
      </div>
    </div>
  );
}

export default FamiliarStatusMinimal;
