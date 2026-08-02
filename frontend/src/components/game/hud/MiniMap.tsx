// Mini-map showing room dots grid (current/visited/boss/unvisited).
// Anchored top-left; non-interactive chrome.

import type { DungeonSnapshot } from '@/game'

interface MiniMapProps {
  dungeon: DungeonSnapshot
}

function MiniMap({ dungeon }: MiniMapProps) {
  const rooms = dungeon.rooms.slice(0, 8)

  return (
    <div className="pointer-events-none grid grid-cols-4 gap-1.5 rounded-md bg-[#1E1B4B]/85 p-sm shadow-card backdrop-blur-sm">
      {rooms.map((room) => {
        const isCurrent = room.id === dungeon.currentRoomId
        const isVisited = dungeon.visitedRoomIds.includes(room.id)
        const isBoss = room.type === 'Boss'

        let colorClass = 'bg-[#3B3870]'
        if (isCurrent) colorClass = 'bg-accent'
        else if (isBoss) colorClass = 'bg-error'
        else if (isVisited) colorClass = 'bg-[#A5A3C4]'

        return (
          <div
            key={room.id}
            className={`h-3 w-3 rounded-full ${colorClass}`}
            title={room.name}
          />
        )
      })}
    </div>
  )
}

export default MiniMap
