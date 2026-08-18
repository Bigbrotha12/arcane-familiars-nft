// Navigation bar with exit buttons (one per exit, emits NAVIGATE_ROOM).
// Anchored bottom-center; interactive.
// Exits are keyed by roomId (unique), not direction, since a room can have
// multiple exits sharing a direction.

import Button from '@/components/ui/Button'
import type { DungeonRoomSnapshot } from '@/game'

interface NavigationBarProps {
  room: DungeonRoomSnapshot | null
  onNavigate: (roomId: string) => void
}

function NavigationBar({ room, onNavigate }: NavigationBarProps) {
  if (!room || room.exits.length === 0) return null

  const exits = room.exits.filter(
    (exit, index, all) => all.findIndex((e) => e.roomId === exit.roomId) === index
  )

  return (
    <div className="pointer-events-auto flex justify-center gap-2 rounded-md bg-[#1E1B4B]/85 p-md shadow-card backdrop-blur-sm">
      {exits.map((exit) => (
        <Button
          key={exit.roomId}
          variant="secondary"
          size="sm"
          onClick={() => onNavigate(exit.roomId)}
        >
          {exit.label || exit.direction.charAt(0).toUpperCase() + exit.direction.slice(1)}
        </Button>
      ))}
    </div>
  )
}

export default NavigationBar
