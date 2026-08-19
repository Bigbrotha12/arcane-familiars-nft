// Circular arc party panel (E1 design).
// Active familiar: larger arc with name on top, offset left.
// Inactive familiar(s): smaller grayscale arc with name below, offset right,
// positioned almost touching the active arc.
// Shared status effects rendered as a horizontal line below the inactive arc
// (up to 10 icons, wraps to a max of 2 lines).

import type { FamiliarState } from '@/game'

interface StatusEffect {
  id: string
  icon: string
  duration?: number
}

interface CircularArcPartyPanelProps {
  party: FamiliarState[]
  activeId?: string
  statusEffects?: StatusEffect[]
}

function renderArc(familiar: FamiliarState, isActive: boolean, size: number = 80, nameOnTop: boolean = false) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0

  // Grayscale for inactive
  const hpColor = isActive
    ? (hpRatio > 0.5 ? '#2DD4BF' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444')
    : '#6B7280'
  const mpColor = isActive ? '#7C5CFC' : '#4B5563'
  const textColor = isActive ? '#F0EFFF' : '#9CA3AF'
  const subtextColor = isActive ? '#B8B5E0' : '#6B7280'

  const strokeWidth = isActive ? 6 : 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const hpOffset = circumference * (1 - hpRatio)
  const mpOffset = circumference * (1 - mpRatio)

  const nameLabel = (
    <span
      className="max-w-20 truncate font-body text-[10px] font-medium drop-shadow-md"
      style={{ color: textColor }}
    >
      {familiar.name}
    </span>
  )

  return (
    <div className="flex flex-col items-center gap-1">
      {nameOnTop && nameLabel}
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
            stroke={mpColor}
            strokeWidth={3}
            strokeDasharray={2 * Math.PI * (radius - strokeWidth - 2)}
            strokeDashoffset={2 * Math.PI * (radius - strokeWidth - 2) * (1 - mpRatio)}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xs font-bold tabular-nums drop-shadow-md" style={{ color: textColor }}>
            {Math.max(0, Math.floor(familiar.hp))}
          </span>
          <span className="font-mono text-[8px] tabular-nums" style={{ color: subtextColor }}>
            {Math.max(0, Math.floor(familiar.mp))} MP
          </span>
        </div>
      </div>
      {!nameOnTop && nameLabel}
    </div>
  )
}

function CircularArcPartyPanel({ party, activeId, statusEffects = [] }: CircularArcPartyPanelProps) {
  if (!party.length) return null

  const resolvedActiveId = activeId ?? party[0].id
  const active = party.find((f) => f.id === resolvedActiveId) ?? party[0]
  const inactive = party.filter((f) => f.id !== active.id)

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {/* Active familiar - larger, name on top, offset left */}
      <div className="relative -ml-12">
        {renderArc(active, true, 92, true)}
      </div>

      {/* Inactive familiar - smaller, grayscale, offset right, almost touching */}
      {inactive.slice(0, 1).map((familiar) => (
        <div key={familiar.id} className="relative -mr-12 -mt-1">
          {renderArc(familiar, false, 72)}
        </div>
      ))}

      {/* Shared status effects - horizontal, below inactive, wraps to 2 lines max */}
      {statusEffects.length > 0 && (
        <div className="mt-1 flex max-w-[176px] flex-wrap items-center justify-center gap-1">
          {statusEffects.map((effect) => (
            <div
              key={effect.id}
              className="relative flex h-5 w-5 items-center justify-center rounded-full bg-[#2D2A5E]/80 text-[10px] backdrop-blur-sm"
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

export default CircularArcPartyPanel