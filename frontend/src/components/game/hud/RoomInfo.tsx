// Room info panel: room name, type badge, description, area progress.
// Anchored top-center; non-interactive chrome.

import type { GameStateSnapshot } from '@/game'

interface RoomInfoProps {
  snapshot: GameStateSnapshot
}

const ROOM_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  Start: { label: 'START', className: 'bg-teal/20 text-teal' },
  Normal: { label: 'ROOM', className: 'bg-[#A5A3C4]/20 text-[#A5A3C4]' },
  Deadend: { label: 'DEAD END', className: 'bg-[#6366A1]/20 text-[#6366A1]' },
  Boss: { label: 'BOSS', className: 'bg-error/20 text-error' },
}

function RoomInfo({ snapshot }: RoomInfoProps) {
  const dungeon = snapshot.dungeon
  if (!dungeon) return null

  const roomType = snapshot.roomType ?? 'Normal'
  const typeStyle = ROOM_TYPE_STYLES[roomType] ?? ROOM_TYPE_STYLES.Normal

  return (
    <div className="pointer-events-none flex max-w-[15rem] flex-col items-center gap-2 rounded-md bg-[#1E1B4B]/85 px-lg py-md shadow-card backdrop-blur-sm">
      <div className="flex max-w-full items-center gap-2">
        <h2 className="truncate font-display text-lg font-bold text-[#F0EFFF]">
          {snapshot.roomName ?? 'Unknown Room'}
        </h2>
        <span
          className={`rounded-sm px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider ${typeStyle.className}`}
        >
          {typeStyle.label}
        </span>
      </div>

      {snapshot.roomDescription && (
        <p className="max-w-md text-center font-body text-sm text-[#B8B5E0]">
          {snapshot.roomDescription}
        </p>
      )}

      <div className="font-mono text-xs text-[#A5A3C4]">
        Room {dungeon.currentRoomIndex + 1} of {dungeon.roomCount}
      </div>
    </div>
  )
}

export default RoomInfo
