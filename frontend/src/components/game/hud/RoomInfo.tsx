// Room info panel: room name, type badge, description, area progress.
// Anchored top-center; non-interactive chrome.

import type { GameStateSnapshot } from '@/game';

interface RoomInfoProps {
  snapshot: GameStateSnapshot;
}

const ROOM_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  Start: { label: 'START', className: 'bg-teal/20 text-teal' },
  Normal: { label: 'ROOM', className: 'bg-[#A5A3C4]/20 text-[#A5A3C4]' },
  Deadend: { label: 'DEAD END', className: 'bg-[#6366A1]/20 text-[#6366A1]' },
  Boss: { label: 'BOSS', className: 'bg-error/20 text-error' },
  Rest: { label: 'REST', className: 'bg-teal/20 text-teal' },
};

function RoomInfo({ snapshot }: RoomInfoProps) {
  const dungeon = snapshot.dungeon;
  if (!dungeon) return null;

  const roomType = snapshot.roomType ?? 'Normal';
  const typeStyle = ROOM_TYPE_STYLES[roomType] ?? ROOM_TYPE_STYLES.Normal;

  return (
    <div className="hud-frame pointer-events-none flex w-[300px] flex-col items-center gap-1 rounded-md px-md py-sm max-sm:w-[420px] max-sm:gap-1.5 max-sm:px-lg max-sm:py-md">
      {(snapshot.areaName || snapshot.daily) && (
        <div className="flex max-w-full items-center gap-1.5">
          {snapshot.areaName && (
            <span className="truncate font-body text-[9px] uppercase tracking-wider text-[#A5A3C4] max-sm:text-[15px]">
              {snapshot.areaName}
            </span>
          )}
          {snapshot.daily && (
            <span className="shrink-0 rounded-sm bg-teal/20 px-1.5 py-px font-display text-[9px] font-semibold uppercase tracking-wider text-teal max-sm:px-2 max-sm:text-[15px]">
              ☀ Daily Expedition
            </span>
          )}
        </div>
      )}
      <div className="flex max-w-full items-center gap-1.5">
        <h2 className="truncate font-display text-sm font-bold text-[#F0EFFF] max-sm:text-[24px]">
          {snapshot.roomName ?? 'Unknown Room'}
        </h2>
        <span
          className={`shrink-0 rounded-sm px-1.5 py-px font-display text-[9px] font-semibold uppercase tracking-wider max-sm:px-2 max-sm:text-[15px] ${typeStyle.className}`}
        >
          {typeStyle.label}
        </span>
      </div>

      {snapshot.roomDescription && (
        <p className="line-clamp-2 text-center font-body text-xs leading-snug text-[#B8B5E0] max-sm:text-[19px]">
          {snapshot.roomDescription}
        </p>
      )}

      {(snapshot.runLootCurrency ?? 0) > 0 || (snapshot.runLootItemCount ?? 0) > 0 ? (
        <p className="font-mono text-[9px] tabular-nums text-yellow max-sm:text-[16px]">
          Run loot: {snapshot.runLootCurrency ?? 0}g
          {snapshot.runLootItemCount
            ? ` · ${snapshot.runLootItemCount} item${snapshot.runLootItemCount === 1 ? '' : 's'}`
            : ''}
        </p>
      ) : null}

      <p className="font-mono text-[9px] tracking-wider text-[#A5A3C4] max-sm:text-[16px]">
        Room {dungeon.currentRoomIndex + 1}/{dungeon.roomCount}
      </p>
    </div>
  );
}

export default RoomInfo;
