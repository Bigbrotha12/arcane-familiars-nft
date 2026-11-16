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
  let disconnectedComponents = 0;

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

  // Handle disconnected rooms: start a new BFS from each unvisited room, laid
  // out to the right of everything placed so far. (The old `nextOffset /
  // DISCONNECT_OFFSET` maths put the first straggler on top of the start room.)
  for (const id of ids) {
    if (positions.has(id)) continue;
    const room = byId.get(id);
    if (!room) continue;

    const placedXs = [...positions.values()].map((pos) => pos.x);
    const rightEdge = placedXs.length ? Math.max(...placedXs) : ORIGIN_X;
    const dx = roundCoord(rightEdge + DISCONNECT_OFFSET * (disconnectedComponents + 1));
    const dy = ORIGIN_Y;
    disconnectedComponents++;

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
  rest: { fill: '#2DD4BF', stroke: '#0A0A0F' },
  unknown: { fill: '#3B3870', stroke: '#6366A1' },
};

function isRestVisible(room: DungeonRoomSnapshot, currentRoomId: string, visitedRoomIds: string[]): boolean {
  // Shrines are a surprise until the room is on the map (current or visited).
  return room.type === 'Rest' && (room.id === currentRoomId || visitedRoomIds.includes(room.id));
}

function nodeStyle(
  room: DungeonRoomSnapshot,
  currentRoomId: string,
  visitedRoomIds: string[]
): { key: string; fill: string; stroke: string } {
  if (isRestVisible(room, currentRoomId, visitedRoomIds)) {
    return {
      key: 'rest',
      fill: NODE_COLORS.rest.fill,
      stroke: room.id === currentRoomId ? '#F0EFFF' : NODE_COLORS.rest.stroke,
    };
  }
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
  { key: 'rest', label: 'Rest' },
  { key: 'boss', label: 'Boss' },
  { key: 'unknown', label: 'Unseen' },
];

function MiniMap({ dungeon }: MiniMapProps) {
  const { positions, edges, viewX, viewY, width, height } = computeLayout(dungeon.rooms);
  const rooms = dungeon.rooms;

  // Node size is derived from the graph extent so a wide dungeon still shows
  // readable dots once the whole graph is scaled into the fixed viewport.
  const nodeRadius = Math.max(1.1, Math.min(2.4, Math.min(width, height) / 9));

  return (
    <div className="hud-frame pointer-events-none flex w-[168px] flex-col gap-1 rounded-md p-[6px] sm:w-[200px] max-sm:w-[300px] max-sm:gap-2 max-sm:p-sm">
      {/* Fixed footprint: the whole graph is scaled to fit inside this box, so it
          can never grow over the room card or get cropped by the canvas edge. */}
      <div className="h-[96px] w-full sm:h-[118px] max-sm:h-[200px]">
        {rooms.length > 0 && (
          <svg
            className="h-full w-full"
            viewBox={`${viewX} ${viewY} ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Dungeon map, ${rooms.length} rooms, current room ${dungeon.currentRoomId}`}
          >
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
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
            <g>
              {rooms.map((room) => {
                const pos = positions.get(room.id);
                if (!pos) return null;
                const style = nodeStyle(room, dungeon.currentRoomId, dungeon.visitedRoomIds);
                const isRest = style.key === 'rest';
                const isCurrent = room.id === dungeon.currentRoomId;
                const r = isCurrent ? nodeRadius * 1.35 : nodeRadius;
                const title = `${room.name}${isCurrent ? ' (current)' : ''}`;
                if (isRest) {
                  return (
                    <rect
                      key={room.id}
                      x={pos.x - r}
                      y={pos.y - r}
                      width={r * 2}
                      height={r * 2}
                      transform={`rotate(45 ${pos.x} ${pos.y})`}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{title}</title>
                    </rect>
                  );
                }
                return (
                  <g key={room.id}>
                    {isCurrent && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={r}
                        fill="none"
                        stroke="#7C5CFC"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                        className="animate-ping motion-reduce:animate-none"
                        style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                        aria-hidden="true"
                      />
                    )}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={r}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{title}</title>
                    </circle>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>

      <div className="grid grid-cols-3 gap-x-1 gap-y-0.5 border-t border-[#3B3870] pt-1">
        {LEGEND.map(({ key, label }) => {
          const color = NODE_COLORS[key];
          return (
            <span key={key} className="flex items-center gap-0.5">
              <span
                className={`inline-block h-1.5 w-1.5 border ${
                  key === 'rest' ? 'rotate-45 rounded-[1px]' : 'rounded-full'
                }`}
                style={{ backgroundColor: color.fill, borderColor: color.stroke }}
              />
              <span className="font-mono text-[7px] uppercase tracking-wide text-[#A5A3C4] max-sm:text-[16px]">
                {label}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default MiniMap;
