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

const DIAMOND_STEP = 12;
const DIAMOND_DIAG = DIAMOND_STEP * 0.707;
const COLLISION_STEP = 0.5;
const DISCONNECT_OFFSET = 30;
const ORIGIN_X = 0;
const ORIGIN_Y = 0;
const RADIUS = 2.5;

const DIR_OFFSETS: Record<string, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -DIAMOND_STEP },
  south: { dx: 0, dy: DIAMOND_STEP },
  east: { dx: DIAMOND_STEP, dy: 0 },
  west: { dx: -DIAMOND_STEP, dy: 0 },
  northeast: { dx: DIAMOND_DIAG, dy: -DIAMOND_DIAG },
  northwest: { dx: -DIAMOND_DIAG, dy: -DIAMOND_DIAG },
  southeast: { dx: DIAMOND_DIAG, dy: DIAMOND_DIAG },
  southwest: { dx: -DIAMOND_DIAG, dy: DIAMOND_DIAG },
};

function getDirOffset(direction: string): { dx: number; dy: number } | undefined {
  return DIR_OFFSETS[direction];
}

function roundCoord(v: number): number {
  return Math.round(v * 100) / 100;
}

function computeLayout(rooms: DungeonRoomSnapshot[]): {
  positions: Map<string, Position>;
  edges: [string, string][];
  viewX: number;
  viewY: number;
  width: number;
  height: number;
} {
  const ids = rooms.map((r) => r.id);
  if (ids.length === 0) {
    return { positions: new Map(), edges: [], viewX: 0, viewY: 0, width: 0, height: 0 };
  }

  const byId = new Map(rooms.map((r) => [r.id, r]));

  // BFS from start room, computing 2D coordinates from direction data.
  // Disconnected rooms get their own coordinate space offset by DISCONNECT_OFFSET.
  const positions = new Map<string, Position>();
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  let nextOffset = 0;

  // Start traversal from the Start room, or first room if no Start.
  const startId =
    rooms.find((r) => r.type === 'Start')?.id ??
    ids.slice().sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })[0];

  // BFS queue: [roomId, baseX, baseY]
  const queue: [string, number, number][] = [[startId, ORIGIN_X, ORIGIN_Y]];
  positions.set(startId, { x: ORIGIN_X, y: ORIGIN_Y });
  seen.add(startId);

  while (queue.length > 0) {
    const [roomId, baseX, baseY] = queue.shift()!;
    const room = byId.get(roomId);
    if (!room) continue;

    for (const exit of room.exits) {
      if (seen.has(exit.roomId)) continue;
      if (!byId.has(exit.roomId)) continue;

      seen.add(exit.roomId);

      const offset = getDirOffset(exit.direction);
      if (!offset) {
        // Unknown direction — place at same coordinate as current room
        positions.set(exit.roomId, { x: baseX, y: baseY });
        edges.push([roomId, exit.roomId]);
        queue.push([exit.roomId, baseX, baseY]);
        continue;
      }

      const px = roundCoord(baseX + offset.dx);
      let py = roundCoord(baseY + offset.dy);

      // Collision resolution: shift Y down until no overlap
      while (true) {
        let collision = false;
        for (const [, pos] of positions) {
          if (roundCoord(pos.x) === px && roundCoord(pos.y) === py) {
            py = roundCoord(py + COLLISION_STEP);
            collision = true;
            break;
          }
        }
        if (!collision) break;
      }

      positions.set(exit.roomId, { x: px, y: py });
      edges.push([roomId, exit.roomId]);
      queue.push([exit.roomId, px, py]);
    }
  }

  // Handle disconnected rooms: start new BFS from unvisited rooms.
  for (const id of ids) {
    if (positions.has(id)) continue;
    const room = byId.get(id);
    if (!room) continue;

    const dx = roundCoord(nextOffset / DISCONNECT_OFFSET);
    const dy = roundCoord(nextOffset % DISCONNECT_OFFSET);

    positions.set(id, { x: dx, y: dy });
    nextOffset++;

    const q: [string, number, number][] = [[id, dx, dy]];

    while (q.length > 0) {
      const [rId, bx, by] = q.shift()!;
      const r = byId.get(rId);
      if (!r) continue;

      for (const exit of r.exits) {
        if (positions.has(exit.roomId)) continue;
        if (!byId.has(exit.roomId)) continue;

        const off = getDirOffset(exit.direction);
        let ex = bx;
        let ey = by;
        if (off) {
          ex = roundCoord(bx + off.dx);
          ey = roundCoord(by + off.dy);
        }

        // Collision resolution: shift Y down until no overlap
        while (true) {
          let collision = false;
          for (const [, pos] of positions) {
            if (roundCoord(pos.x) === ex && roundCoord(pos.y) === ey) {
              ey = roundCoord(ey + COLLISION_STEP);
              collision = true;
              break;
            }
          }
          if (!collision) break;
        }

        positions.set(exit.roomId, { x: ex, y: ey });
        edges.push([rId, exit.roomId]);
        q.push([exit.roomId, ex, ey]);
      }
    }
  }

  // Compute SVG bounds from all positions.
  if (positions.size === 0) {
    return { positions, edges, viewX: 0, viewY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [, pos] of positions) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x);
    maxY = Math.max(maxY, pos.y);
  }

  const viewX = roundCoord(minX - RADIUS - 1);
  const viewY = roundCoord(minY - RADIUS - 1);
  const viewW = roundCoord(maxX - minX + RADIUS * 2 + 2);
  const viewH = roundCoord(maxY - minY + RADIUS * 2 + 2);

  return {
    positions,
    edges,
    viewX,
    viewY,
    width: viewW,
    height: viewH,
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
  const { positions, edges, viewX, viewY, width, height } = computeLayout(dungeon.rooms);
  const rooms = dungeon.rooms;

  return (
    <div className="hud-frame pointer-events-none flex flex-col gap-1 rounded-md p-[6px]">
      {rooms.length > 0 && (
        <svg width={width * 12} height={height * 12} viewBox={`${viewX} ${viewY} ${width} ${height}`}>
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
