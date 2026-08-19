// Preview showing Compact Card positioned near sprites (left of enemy, right of player)
// with solid background and double border.

import type { FamiliarState } from '@/game'

const mockFamiliar: FamiliarState = {
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
}

const mockEnemy: FamiliarState = {
  id: 'shadowCat',
  name: 'Umbra',
  hp: 18,
  maxHp: 50,
  mp: 8,
  maxMp: 20,
  attack: 22,
  defense: 10,
  speed: 18,
  arcane: 15,
  affinity: 'shadow',
}

const mockStatusEffects = [
  { id: 'burn', icon: '🔥', duration: 2 },
  { id: 'shield', icon: '🛡️', duration: 3 },
  { id: 'regen', icon: '💚', duration: 1 },
]

function CompactCardInContext() {
  const hpRatio = (f: FamiliarState) => f.maxHp > 0 ? Math.min(1, Math.max(0, f.hp / f.maxHp)) : 0
  const mpRatio = (f: FamiliarState) => f.maxMp > 0 ? Math.min(1, Math.max(0, f.mp / f.maxMp)) : 0
  const hpColor = (ratio: number) => ratio > 0.5 ? 'bg-teal' : ratio > 0.25 ? 'bg-warning' : 'bg-error'

  return (
    <div className="relative h-96 w-full rounded-lg border border-[#3B3870] bg-[#0A0A0F] overflow-hidden">
      {/* Enemy area - top right */}
      <div className="absolute top-16 right-32">
        {/* Enemy sprite placeholder */}
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 border-2 border-purple-400 shadow-lg flex items-center justify-center text-4xl">
          👾
        </div>
      </div>

      {/* Enemy card - positioned to the LEFT of enemy sprite with separation */}
      <div className="absolute top-20 right-64">
        <div className="pointer-events-none flex w-48 flex-col gap-1 rounded-md border-4 border-double border-[#3B3870] bg-[#1E1B4B] px-2 py-1.5 shadow-lg">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-body text-xs font-semibold text-[#F0EFFF]">
              {mockEnemy.name}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] font-medium text-teal">HP</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-[2px] border border-[#2A2A45] bg-[#1A1A2E]">
              <div className={`h-full ${hpColor(hpRatio(mockEnemy))} transition-all duration-300`} style={{ width: `${hpRatio(mockEnemy) * 100}%` }} />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-[#B8B5E0]">
              {Math.max(0, Math.floor(mockEnemy.hp))}/{mockEnemy.maxHp}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] font-medium text-accent">MP</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-[2px] border border-[#2A2A45] bg-[#1A1A2E]">
              <div className="h-full bg-accent transition-all duration-300" style={{ width: `${mpRatio(mockEnemy) * 100}%` }} />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-[#B8B5E0]">
              {Math.max(0, Math.floor(mockEnemy.mp))}/{mockEnemy.maxMp}
            </span>
          </div>

          {mockStatusEffects.length > 0 && (
            <div className="flex items-center gap-0.5 border-t border-[#3B3870] pt-1">
              {mockStatusEffects.map((effect) => (
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
      </div>

      {/* Player area - bottom left */}
      <div className="absolute bottom-16 left-32">
        {/* Player sprite placeholder */}
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 border-2 border-blue-300 shadow-lg flex items-center justify-center text-4xl">
          🐕
        </div>
      </div>

      {/* Player card - positioned to the RIGHT of player sprite with separation */}
      <div className="absolute bottom-20 left-64">
        <div className="pointer-events-none flex w-48 flex-col gap-1 rounded-md border-4 border-double border-[#3B3870] bg-[#1E1B4B] px-2 py-1.5 shadow-lg">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-body text-xs font-semibold text-[#F0EFFF]">
              {mockFamiliar.name}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] font-medium text-teal">HP</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-[2px] border border-[#2A2A45] bg-[#1A1A2E]">
              <div className={`h-full ${hpColor(hpRatio(mockFamiliar))} transition-all duration-300`} style={{ width: `${hpRatio(mockFamiliar) * 100}%` }} />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-[#B8B5E0]">
              {Math.max(0, Math.floor(mockFamiliar.hp))}/{mockFamiliar.maxHp}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] font-medium text-accent">MP</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-[2px] border border-[#2A2A45] bg-[#1A1A2E]">
              <div className="h-full bg-accent transition-all duration-300" style={{ width: `${mpRatio(mockFamiliar) * 100}%` }} />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-[#B8B5E0]">
              {Math.max(0, Math.floor(mockFamiliar.mp))}/{mockFamiliar.maxMp}
            </span>
          </div>

          {mockStatusEffects.length > 0 && (
            <div className="flex items-center gap-0.5 border-t border-[#3B3870] pt-1">
              {mockStatusEffects.map((effect) => (
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
      </div>
    </div>
  )
}

export default CompactCardInContext
