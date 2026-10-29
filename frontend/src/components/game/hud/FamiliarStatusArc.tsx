// Circular arc design — HP as a ring around a center point, MP as inner ring.
// Status icons in a row below.

import type { FamiliarState } from '@/game';

interface FamiliarStatusArcProps {
  familiar: FamiliarState;
  position: 'above' | 'below';
  statusEffects?: Array<{ id: string; icon: string; duration?: number }>;
}

function FamiliarStatusArc({ familiar, position, statusEffects = [] }: FamiliarStatusArcProps) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0;
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0;

  const hpColor = hpRatio > 0.5 ? '#2DD4BF' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
  const size = 72;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const hpOffset = circumference * (1 - hpRatio * 0.75);

  return (
    <div
      className={`pointer-events-none flex flex-col items-center gap-1 ${
        position === 'above' ? 'flex-col' : 'flex-col-reverse'
      }`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1A1A2E"
            strokeWidth={strokeWidth}
            opacity={0.6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={hpColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={hpOffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - strokeWidth - 2}
            fill="none"
            stroke="#1A1A2E"
            strokeWidth={3}
            opacity={0.6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - strokeWidth - 2}
            fill="none"
            stroke="#7C5CFC"
            strokeWidth={3}
            strokeDasharray={2 * Math.PI * (radius - strokeWidth - 2)}
            strokeDashoffset={2 * Math.PI * (radius - strokeWidth - 2) * (1 - mpRatio * 0.75)}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xs font-bold tabular-nums text-[#F0EFFF] drop-shadow-md">
            {Math.max(0, Math.floor(familiar.hp))}
          </span>
          <span className="font-mono text-[8px] tabular-nums text-[#B8B5E0]">
            {Math.max(0, Math.floor(familiar.mp))} MP
          </span>
        </div>
      </div>

      <span className="max-w-20 truncate font-body text-[10px] font-medium text-[#F0EFFF] drop-shadow-md">
        {familiar.name}
      </span>

      {statusEffects.length > 0 && (
        <div className="flex items-center gap-0.5">
          {statusEffects.map((effect) => (
            <div
              key={effect.id}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2D2A5E]/80 text-[8px] backdrop-blur-sm"
              title={effect.id}
            >
              {effect.icon}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FamiliarStatusArc;
