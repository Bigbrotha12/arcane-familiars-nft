// Boss overlay: "⚠ BOSS ROOM AHEAD" + Enter/Retreat buttons.
// Center overlay; interactive.

import Button from '@/components/ui/Button'

interface BossOverlayProps {
  onEnter: () => void
  onRetreat: () => void
}

function BossOverlay({ onEnter, onRetreat }: BossOverlayProps) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="hud-frame max-w-sm rounded-lg p-lg">
        <h2 className="mb-lg font-display text-xl font-bold text-error">
          ⚠ BOSS ROOM AHEAD
        </h2>
        <div className="flex gap-3">
          <Button variant="primary" size="md" onClick={onEnter}>
            Enter
          </Button>
          <Button variant="secondary" size="md" onClick={onRetreat}>
            Retreat
          </Button>
        </div>
      </div>
    </div>
  )
}

export default BossOverlay
