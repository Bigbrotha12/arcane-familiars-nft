// Preview component showing the two selected designs:
// 1. Compact Card (solid, double border, positioned left of enemy, right of player)
// 2. Circular Arc party panel - E1 variation (selected)

import CompactCardInContext from './CompactCardInContext'
import CircularArcVariations from './CircularArcVariations'

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
