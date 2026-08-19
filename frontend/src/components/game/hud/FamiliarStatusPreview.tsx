// Preview component showing all FamiliarStatusCard variants for comparison.
// Remove after selecting a design.

import FamiliarStatusCompact from './FamiliarStatusCompact'
import FamiliarStatusMinimal from './FamiliarStatusMinimal'
import FamiliarStatusArc from './FamiliarStatusArc'
import FamiliarStatusSide from './FamiliarStatusSide'
import FamiliarStatusTooltip from './FamiliarStatusTooltip'
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

function FamiliarStatusPreview() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] p-8">
      <h1 className="mb-8 font-display text-2xl font-semibold text-[#F0EFFF]">
        FamiliarStatusCard Design Variants
      </h1>

      <div className="space-y-12">
        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            A. Compact Card (above/below)
          </h2>
          <div className="flex items-start gap-12 rounded-lg border border-[#3B3870] bg-[#1E1B4B]/50 p-8">
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Above (enemy)</p>
              <FamiliarStatusCompact familiar={mockEnemy} position="above" statusEffects={mockStatusEffects} />
            </div>
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Below (player)</p>
              <FamiliarStatusCompact familiar={mockFamiliar} position="below" statusEffects={mockStatusEffects} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            B. Minimal Bars (no background)
          </h2>
          <div className="flex items-start gap-12 rounded-lg border border-[#3B3870] bg-[#1E1B4B]/50 p-8">
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Above</p>
              <FamiliarStatusMinimal familiar={mockEnemy} position="above" statusEffects={mockStatusEffects} />
            </div>
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Below</p>
              <FamiliarStatusMinimal familiar={mockFamiliar} position="below" statusEffects={mockStatusEffects} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            C. Circular Arc (rings)
          </h2>
          <div className="flex items-start gap-12 rounded-lg border border-[#3B3870] bg-[#1E1B4B]/50 p-8">
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Above</p>
              <FamiliarStatusArc familiar={mockEnemy} position="above" statusEffects={mockStatusEffects} />
            </div>
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Below</p>
              <FamiliarStatusArc familiar={mockFamiliar} position="below" statusEffects={mockStatusEffects} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            D. Side Panel (vertical bars)
          </h2>
          <div className="flex items-start gap-12 rounded-lg border border-[#3B3870] bg-[#1E1B4B]/50 p-8">
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Left side</p>
              <FamiliarStatusSide familiar={mockEnemy} position="left" statusEffects={mockStatusEffects} />
            </div>
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Right side</p>
              <FamiliarStatusSide familiar={mockFamiliar} position="right" statusEffects={mockStatusEffects} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            E. Tooltip (with pointer)
          </h2>
          <div className="flex items-start gap-12 rounded-lg border border-[#3B3870] bg-[#1E1B4B]/50 p-8">
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Above (pointer down)</p>
              <FamiliarStatusTooltip familiar={mockEnemy} position="above" statusEffects={mockStatusEffects} />
            </div>
            <div>
              <p className="mb-2 text-xs text-[#A5A3C4]">Below (pointer up)</p>
              <FamiliarStatusTooltip familiar={mockFamiliar} position="below" statusEffects={mockStatusEffects} />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default FamiliarStatusPreview
