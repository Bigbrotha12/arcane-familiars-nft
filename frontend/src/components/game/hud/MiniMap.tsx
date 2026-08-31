// Mini-map showing the dungeon room graph: nodes laid out by BFS depth from the
// Start room, with exit edges drawn between connected rooms. Current room is
// highlighted; visited/start/boss/unvisited rooms use distinct colors. Includes
// a legend row. Anchored top-left; non-interactive chrome.

import type { DungeonSnapshot, DungeonRoomSnapshot } from '@/game';

interface MiniMapProps {
  dungeon: DungeonSnapshot;
}

interface Position {
  x: number;
  y: number;
}

const COL_W = 13;
const ROW_H = 11;
const ORIGIN_X = 6;
const ORIGIN_Y = 8;
const RADIUS = 2.5;

function computeLayout(rooms: DungeonRoomSnapshot[]): {
  positions: Map<string, Position>;
  edges: [string, string][];
  width: number;
  height: number;
} {
  const ids = rooms.map((r) => r.id);
  if (ids.length === 0) {
    return { positions: new Map(), edges: [], width: 0, height: 0 };
  }

  const byId = new Map(rooms.map((r) => [r.id, r]));
  const startId =
    rooms.find((r) => r.type === 'Start')?.id ??
    ids.slice().sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })[0];

  const depth = new Map<string, number>();
  const levelIds: string[][] = [];
  const queue: string[] = [startId];
  depth.set(startId, 0);
  levelIds[0] = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const exit of byId.get(id)?.exits ?? []) {
      if (!byId.has(exit.roomId) || depth.has(exit.roomId)) continue;
      depth.set(exit.roomId, d + 1);
      if (!levelIds[d + 1]) levelIds[d + 1] = [];
      levelIds[d + 1].push(exit.roomId);
      queue.push(exit.roomId);
    }
  }
  for (const id of ids) {
    if (!depth.has(id)) {
      depth.set(id, 0);
      if (!levelIds[0]) levelIds[0] = [];
      levelIds[0].push(id);
    }
  }

  const positions = new Map<string, Position>();
  let maxCol = 0;
  let maxRow = 0;
  for (let col = 0; col < levelIds.length; col++) {
    levelIds[col].forEach((id, row) => {
      positions.set(id, { x: ORIGIN_X + col * COL_W, y: ORIGIN_Y + row * ROW_H });
      maxCol = Math.max(maxCol, col);
      maxRow = Math.max(maxRow, row);
    });
  }

  const edges: [string, string][] = [];
  const seen = new Set<string>();
  for (const room of rooms) {
    for (const exit of room.exits) {
      if (!positions.has(exit.roomId)) continue;
      const key = [room.id, exit.roomId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([room.id, exit.roomId]);
    }
  }

  return {
    positions,
    edges,
    width: ORIGIN_X + maxCol * COL_W + RADIUS * 2 + 2,
    height: ORIGIN_Y + maxRow * ROW_H + RADIUS * 2 + 2,
  };
}

const NODE_COLORS: Record<string, { fill: string; stroke: string }> = {
  current: { fill: '#7C5CFC', stroke: '#F0EFFF' },
  start: { fill: '#2DD4BF', stroke: '#0A0A0F' },
  visited: { fill: '#A5A3C4', stroke: '#1E1B4B' },
  boss: { fill: '#EF4444', stroke: '#0A0A0F' },
  unknown: { fill: '#3B3870', stroke: '#6366A1' },
};

function nodeStyle(
  room: DungeonRoomSnapshot,
  currentRoomId: string,
  visitedRoomIds: string[]
): { key: string; fill: string; stroke: string } {
  if (room.id === currentRoomId) {
    return { key: 'current', ...NODE_COLORS.current };
  }
  if (room.type === 'Start') {
    return { key: 'start', ...NODE_COLORS.start };
  }
  if (visitedRoomIds.includes(room.id)) {
    return { key: 'visited', ...NODE_COLORS.visited };
  }
  if (room.type === 'Boss') {
    return { key: 'boss', ...NODE_COLORS.boss };
  }
  return { key: 'unknown', ...NODE_COLORS.unknown };
}

const LEGEND: { key: string; label: string }[] = [
  { key: 'current', label: 'You' },
  { key: 'start', label: 'Start' },
  { key: 'visited', label: 'Visited' },
  { key: 'boss', label: 'Boss' },
  { key: 'unknown', label: 'Unseen' },
];

function MiniMap({ dungeon }: MiniMapProps) {
  const { positions, edges, width, height } = computeLayout(dungeon.rooms);
  const rooms = dungeon.rooms;

  return (
    <div className="hud-frame pointer-events-none flex flex-col gap-1 rounded-md p-[6px]">
      {rooms.length > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <g>
            {edges.map(([a, b], i) => {
              const pa = positions.get(a);
              const pb = positions.get(b);
              if (!pa || !pb) return null;
              const isLit = a === dungeon.currentRoomId || b === dungeon.currentRoomId;
              return (
                <line
                  key={i}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={isLit ? '#7C5CFC' : '#3B3870'}
                  strokeWidth={isLit ? 1.5 : 1}
                  strokeOpacity={isLit ? 1 : 0.7}
                />
              );
            })}
          </g>
          <g>
            {rooms.map((room) => {
              const pos = positions.get(room.id);
              if (!pos) return null;
              const style = nodeStyle(room, dungeon.currentRoomId, dungeon.visitedRoomIds);
              const r = style.key === 'current' ? RADIUS + 1 : RADIUS;
              return (
                <circle
                  key={room.id}
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={1}
                >
                  <title>{`${room.name}${room.id === dungeon.currentRoomId ? ' (current)' : ''}`}</title>
                </circle>
              );
            })}
          </g>
        </svg>
      )}

      <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
        {LEGEND.map(({ key, label }) => {
          const color = NODE_COLORS[key];
          return (
            <span key={key} className="flex items-center gap-0.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full border"
                style={{ backgroundColor: color.fill, borderColor: color.stroke }}
              />
              <span className="font-mono text-[8px] uppercase tracking-wide text-[#A5A3C4]">{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default MiniMap;
