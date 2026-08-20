// Preview showing Circular Arc design for party panel
// Active familiar: larger arc, positioned above-left of center
// Inactive familiars: smaller arcs, positioned below-right of center
// Status effects as horizontal divider between arcs

import type { FamiliarState } from '@/game'

const mockParty: FamiliarState[] = [
  {
    id: 'whiteDog',
    name: 'Lumina',
    hp: 45,
    maxHp: 60,
    mp: 12,
    maxMp: 25,
    attack: 18,
    defense: 12,
    speed: 15,
    arcane: 20,
    affinity: 'light',
  },
  {
    id: 'fireFox',
    name: 'Ember',
    hp: 28,
    maxHp: 40,
    mp: 18,
    maxMp: 20,
    attack: 15,
    defense: 10,
    speed: 18,
    arcane: 22,
    affinity: 'fire',
  },
  {
    id: 'waterFish',
    name: 'Aqua',
    hp: 35,
    maxHp: 45,
    mp: 15,
    maxMp: 22,
    attack: 12,
    defense: 16,
    speed: 14,
    arcane: 18,
    affinity: 'water',
  },
]

const mockStatusEffects = [
  { id: 'burn', icon: '🔥', duration: 2 },
  { id: 'shield', icon: '🛡️', duration: 3 },
  { id: 'regen', icon: '💚', duration: 1 },
]

function CircularArcPartyPreview() {
  const activeId = mockParty[0].id

  const renderArc = (familiar: FamiliarState, isActive: boolean) => {
    const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0
    const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0

    const hpColor = hpRatio > 0.5 ? '#2DD4BF' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444'
    const size = isActive ? 88 : 72
    const strokeWidth = isActive ? 6 : 5
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius

    const hpOffset = circumference * (1 - hpRatio * 0.75)
    const mpOffset = circumference * (1 - mpRatio * 0.75)

    return (
      <div className="flex flex-col items-center gap-1">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            {/* HP background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#1A1A2E"
              strokeWidth={strokeWidth}
              opacity={0.6}
            />
            {/* HP fill ring */}
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
            {/* MP background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius - strokeWidth - 2}
              fill="none"
              stroke="#1A1A2E"
              strokeWidth={3}
              opacity={0.6}
            />
            {/* MP fill ring */}
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

        <span
          className={`max-w-20 truncate font-body text-[10px] font-medium drop-shadow-md ${
            isActive ? 'text-[#F0EFFF]' : 'text-[#B8B5E0]'
          }`}
        >
          {familiar.name}
        </span>
      </div>
    )
  }

  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      {/* Active familiar - above-left of center */}
      <div className="absolute top-1/4 left-1/2 -translate-x-[60%] -translate-y-1/2">
        {renderArc(mockParty[0], true)}
      </div>

      {/* Status effects divider - horizontal line between arcs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
        <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#3B3870]" />
        <div className="flex items-center gap-1">
          {mockStatusEffects.map((effect) => (
            <div
              key={effect.id}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2D2A5E]/80 text-[10px] backdrop-blur-sm"
              title={effect.id}
            >
              {effect.icon}
            </div>
          ))}
        </div>
        <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#3B3870]" />
      </div>

      {/* Inactive familiars - below-right of center */}
      <div className="absolute bottom-1/4 left-1/2 -translate-x-[40%] translate-y-1/2 flex items-end gap-3">
        {renderArc(mockParty[1], false)}
        {renderArc(mockParty[2], false)}
      </div>
    </div>
  )
}

export default CircularArcPartyPreview
