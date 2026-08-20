// Preview component showing the two selected designs:
// 1. Compact Card (solid, double border, positioned left of enemy, right of player)
// 2. Circular Arc party panel - E1 variation (selected)

import type { FamiliarState } from '@/game'
import FamiliarStatusCompact from './FamiliarStatusCompact'
import CompactCardInContext from './CompactCardInContext'
import CircularArcVariations from './CircularArcVariations'

const previewFamiliar: FamiliarState = {
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

const fullStatusEffects = [
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

function FamiliarStatusPreview() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] p-8">
      <h1 className="mb-8 font-display text-2xl font-semibold text-[#F0EFFF]">
        FamiliarStatusCard Design Preview
      </h1>

      <div className="space-y-12">
        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            A. Compact Card (Solid, Double Border)
          </h2>
          <p className="mb-4 text-sm text-[#A5A3C4]">
            Positioned left of enemy sprite, right of player sprite. Solid background with double-lined border.
            Vertically centered with generous spacing.
          </p>
          <CompactCardInContext />
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            A2. Compact Card — 10 Status Effects (Full)
          </h2>
          <p className="mb-4 text-sm text-[#A5A3C4]">
            Single-row status slot grid filled with 10 effects. Empty slots are invisible but reserve space.
          </p>
          <div className="flex flex-wrap items-start gap-8">
            <FamiliarStatusCompact familiar={previewFamiliar} statusEffects={fullStatusEffects} />
            <FamiliarStatusCompact familiar={previewFamiliar} isBoss statusEffects={fullStatusEffects} />
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            B. Circular Arc Party Panel (E1 Selected)
          </h2>
          <p className="mb-4 text-sm text-[#A5A3C4]">
            2 familiars. Active familiar larger with name on top. Inactive familiar smaller with grayscale and name below.
            Status effects (up to 10) displayed horizontally below inactive member. Arcs positioned close together.
          </p>
          <CircularArcVariations />
        </section>
      </div>
    </div>
  )
}

export default FamiliarStatusPreview
