// Treasure overlay: "You found a treasure!" + Take/Leave buttons.
// Center overlay; interactive.

import Button from '@/components/ui/Button'

interface TreasureOverlayProps {
  onTake: () => void
  onLeave: () => void
}

function TreasureOverlay({ onTake, onLeave }: TreasureOverlayProps) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="hud-frame max-w-sm rounded-lg p-lg">
        <h2 className="mb-lg font-display text-xl font-bold text-[#F0EFFF]">
          You found a treasure!
        </h2>
        <div className="flex gap-3">
          <Button variant="primary" size="md" onClick={onTake}>
            Take
          </Button>
          <Button variant="secondary" size="md" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </div>
    </div>
  )
}

export default TreasureOverlay
