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
    <div className="hud-frame pointer-events-none flex w-[300px] flex-col items-center gap-1 rounded-md px-md py-sm">
      <div className="flex max-w-full items-center gap-1.5">
        <h2 className="truncate font-display text-sm font-bold text-[#F0EFFF]">
          {snapshot.roomName ?? 'Unknown Room'}
        </h2>
        <span
          className={`shrink-0 rounded-sm px-1.5 py-px font-display text-[9px] font-semibold uppercase tracking-wider ${typeStyle.className}`}
        >
          {typeStyle.label}
        </span>
      </div>

      {snapshot.roomDescription && (
        <p className="line-clamp-2 text-center font-body text-xs leading-snug text-[#B8B5E0]">
          {snapshot.roomDescription}
        </p>
      )}

      <p className="font-mono text-[9px] tracking-wider text-[#A5A3C4]">
        Room {dungeon.currentRoomIndex + 1}/{dungeon.roomCount}
      </p>
    </div>
  )
}

export default RoomInfo
