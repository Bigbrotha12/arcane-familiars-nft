// Navigation bar with exit buttons (one per exit, emits NAVIGATE_ROOM).
// Anchored bottom-center; interactive.

import Button from '@/components/ui/Button'
import type { DungeonRoomSnapshot, ExploreDirection } from '@/game'

interface NavigationBarProps {
  room: DungeonRoomSnapshot | null
  onNavigate: (direction: ExploreDirection) => void
}

function NavigationBar({ room, onNavigate }: NavigationBarProps) {
  if (!room || room.exits.length === 0) return null

  return (
    <div className="pointer-events-auto flex justify-center gap-2 rounded-md bg-[#1E1B4B]/85 p-md shadow-card backdrop-blur-sm">
      {room.exits.map((exit) => {
        const direction = exit.direction as ExploreDirection
        const label = exit.label || exit.direction.charAt(0).toUpperCase() + exit.direction.slice(1)

        return (
          <Button
            key={exit.direction}
            variant="secondary"
            size="sm"
            onClick={() => onNavigate(direction)}
          >
            {label}
          </Button>
        )
      })}
    </div>
  )
}

export default NavigationBar
