// Preview component showing the two selected designs:
// 1. Compact Card (solid, double border, positioned left of enemy, right of player)
// 2. Circular Arc party panel (active larger above-left, inactive smaller below-right)

import CompactCardInContext from './CompactCardInContext'
import CircularArcPartyPreview from './CircularArcPartyPreview'

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
          </p>
          <CompactCardInContext />
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
            B. Circular Arc Party Panel
          </h2>
          <p className="mb-4 text-sm text-[#A5A3C4]">
            Active familiar (larger arc, above-left of center). Inactive familiars (smaller arcs, below-right of center).
            Status effects as horizontal divider between arcs.
          </p>
          <CircularArcPartyPreview />
        </section>
      </div>
    </div>
  )
}

export default FamiliarStatusPreview
