// Multiple variations of circular arc party panel with 2 familiars
// Shows different layouts: horizontal/vertical status, grayscale, overlapping

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
]

const mockStatusEffects = [
  { id: 'burn', icon: '🔥', duration: 2 },
  { id: 'shield', icon: '🛡️', duration: 3 },
  { id: 'regen', icon: '💚', duration: 1 },
  { id: 'poison', icon: '☠️', duration: 4 },
  { id: 'stun', icon: '⚡', duration: 1 },
  { id: 'boost', icon: '⬆️', duration: 3 },
  { id: 'slow', icon: '🐌', duration: 2 },
  { id: 'haste', icon: '💨', duration: 2 },
  { id: 'blind', icon: '🌑', duration: 3 },
  { id: 'rage', icon: '💢', duration: 1 },
]

function renderArc(familiar: FamiliarState, isActive: boolean, size: number = 80) {
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

  const hpOffset = circumference * (1 - hpRatio * 0.75)
  const mpOffset = circumference * (1 - mpRatio * 0.75)

  return (
    <div className="flex flex-col items-center gap-1">
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
            strokeDashoffset={2 * Math.PI * (radius - strokeWidth - 2) * (1 - mpRatio * 0.75)}
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

      <span
        className="max-w-20 truncate font-body text-[10px] font-medium drop-shadow-md"
        style={{ color: textColor }}
      >
        {familiar.name}
      </span>
    </div>
  )
}

function renderStatusHorizontal(statusEffects: typeof mockStatusEffects, maxWidth: number = 200) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1"
      style={{ maxWidth }}
    >
      {statusEffects.map((effect) => (
        <div
          key={effect.id}
          className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[#2D2A5E]/80 text-xs backdrop-blur-sm"
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
  )
}

function renderStatusVertical(statusEffects: typeof mockStatusEffects, maxHeight: number = 120) {
  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ maxHeight, overflowY: 'auto' }}
    >
      {statusEffects.map((effect) => (
        <div
          key={effect.id}
          className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[#2D2A5E]/80 text-xs backdrop-blur-sm"
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
  )
}

export function ArcVariationA() {
  // Horizontal status, more offset, overlapping arcs
  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex flex-col items-center gap-6">
          {/* Active familiar - larger, offset left and up */}
          <div className="relative -ml-16 -mt-8">
            {renderArc(mockParty[0], true, 88)}
          </div>

          {/* Status effects - horizontal */}
          {renderStatusHorizontal(mockStatusEffects, 180)}

          {/* Inactive familiar - smaller, offset right and down */}
          <div className="relative -mr-16 -mb-8">
            {renderArc(mockParty[1], false, 72)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ArcVariationB() {
  // Vertical status, overlapping arcs
  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex items-center gap-4">
          {/* Active familiar - offset left and up */}
          <div className="relative -mt-12">
            {renderArc(mockParty[0], true, 88)}
          </div>

          {/* Status effects - vertical */}
          {renderStatusVertical(mockStatusEffects, 100)}

          {/* Inactive familiar - offset right and down */}
          <div className="relative -mb-12">
            {renderArc(mockParty[1], false, 72)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ArcVariationC() {
  // Horizontal status, grayscale inactive, more offset, overlapping
  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex flex-col items-center gap-4">
          {/* Active familiar - larger, offset left and up */}
          <div className="relative -ml-20 -mt-12">
            {renderArc(mockParty[0], true, 92)}
          </div>

          {/* Status effects - horizontal */}
          {renderStatusHorizontal(mockStatusEffects, 200)}

          {/* Inactive familiar - smaller, grayscale, offset right and down */}
          <div className="relative -mr-20 -mb-12">
            {renderArc(mockParty[1], false, 72)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ArcVariationD() {
  // Vertical status, grayscale inactive, overlapping
  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex items-center gap-6">
          {/* Active familiar - offset left and up */}
          <div className="relative -mt-16">
            {renderArc(mockParty[0], true, 88)}
          </div>

          {/* Status effects - vertical */}
          {renderStatusVertical(mockStatusEffects, 120)}

          {/* Inactive familiar - grayscale, offset right and down */}
          <div className="relative -mb-16">
            {renderArc(mockParty[1], false, 72)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ArcVariationE1() {
  // Very close to overlapping, horizontal status below inactive, 10 effects
  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex flex-col items-center gap-3">
          {/* Active familiar - larger, offset left and up */}
          <div className="relative -ml-12">
            {renderArc(mockParty[0], true, 92)}
          </div>

          {/* Inactive familiar - smaller, grayscale, offset right and down, almost touching */}
          <div className="relative -mr-12 -mt-2">
            {renderArc(mockParty[1], false, 72)}
          </div>

          {/* Status effects - horizontal, below inactive */}
          {renderStatusHorizontal(mockStatusEffects, 160)}
        </div>
      </div>
    </div>
  )
}

export function ArcVariationE2() {
  // Absolute positioning for precise overlap control, status below inactive
  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      <div className="relative w-[200px] h-[280px]">
        {/* Active familiar - positioned with absolute */}
        <div className="absolute top-0 left-1/2 -translate-x-[60%]">
          {renderArc(mockParty[0], true, 92)}
        </div>

        {/* Inactive familiar - positioned almost touching below */}
        <div className="absolute top-[85px] left-1/2 -translate-x-[40%]">
          {renderArc(mockParty[1], false, 72)}
        </div>

        {/* Status effects - below both arcs */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          {renderStatusHorizontal(mockStatusEffects, 160)}
        </div>
      </div>
    </div>
  )
}

export function ArcVariationE3() {
  // Tighter overlap with absolute positioning, status below
  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      <div className="relative w-[200px] h-[260px]">
        {/* Active familiar - positioned with absolute */}
        <div className="absolute top-0 left-1/2 -translate-x-[60%]">
          {renderArc(mockParty[0], true, 92)}
        </div>

        {/* Inactive familiar - almost touching */}
        <div className="absolute top-[78px] left-1/2 -translate-x-[40%]">
          {renderArc(mockParty[1], false, 72)}
        </div>

        {/* Status effects - below both arcs */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          {renderStatusHorizontal(mockStatusEffects, 160)}
        </div>
      </div>
    </div>
  )
}

function CircularArcVariations() {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 font-display text-base font-medium text-[#B8B5E0]">
          A. Horizontal Status, More Offset, Overlapping
        </h3>
        <ArcVariationA />
      </div>

      <div>
        <h3 className="mb-3 font-display text-base font-medium text-[#B8B5E0]">
          B. Vertical Status, Overlapping
        </h3>
        <ArcVariationB />
      </div>

      <div>
        <h3 className="mb-3 font-display text-base font-medium text-[#B8B5E0]">
          C. Horizontal Status, Grayscale Inactive, More Offset
        </h3>
        <ArcVariationC />
      </div>

      <div>
        <h3 className="mb-3 font-display text-base font-medium text-[#B8B5E0]">
          D. Vertical Status, Grayscale Inactive, Overlapping
        </h3>
        <ArcVariationD />
      </div>

      <div>
        <h3 className="mb-3 font-display text-base font-medium text-[#B8B5E0]">
          E1. Very Close, Horizontal Status Below Inactive, 10 Effects
        </h3>
        <ArcVariationE1 />
      </div>

      <div>
        <h3 className="mb-3 font-display text-base font-medium text-[#B8B5E0]">
          E2. Absolute Positioning, Status Below Inactive, 10 Effects
        </h3>
        <ArcVariationE2 />
      </div>

      <div>
        <h3 className="mb-3 font-display text-base font-medium text-[#B8B5E0]">
          E3. Tighter Overlap, Status Below Inactive, 10 Effects
        </h3>
        <ArcVariationE3 />
      </div>
    </div>
  )
}

export default CircularArcVariations
