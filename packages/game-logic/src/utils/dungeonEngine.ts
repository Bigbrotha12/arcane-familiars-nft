import { type Area, type Room, type DungeonState, RoomType } from '@/types/exploration';
import { randomInRange, weightedRandom, seededRandom } from '@/utils/mathUtils';

const ROOM_NAMES = [
  'Twilight Path', 'Crystal Alcove', 'Mossy Chamber', 'Stone Corridor',
  'Glowing Grotto', 'Ancient Hall', 'Silent Passage', 'Whispering Den',
  'Hidden Nook', 'Dusty Vault', 'Tangled Grove', 'Moonlit Clearing',
  'Echoing Tunnel', 'Fading Trail', 'Shadowed Bend', 'Rumbling Shaft',
];

const ROOM_DESCRIPTIONS = [
  'The air is thick with mystery.',
  'Strange sounds echo from within.',
  'The path narrows ahead.',
  'Light filters through cracks above.',
  'Something stirs in the darkness.',
  'The walls glisten with moisture.',
  'A gentle breeze flows through.',
  'Ancient runes line the walls.',
];

export enum Directions {
  North,
  South,
  East,
  West,
  Northeast,
  Northwest,
  Southeast,
  Southwest
};

/**
 * Generate a dungeon for the given area using a seeded RNG.
 * Creates a valid room graph with start, normal, and boss rooms.
 */
export function generateDungeon(area: Area, seed: number): DungeonState {
  if (area.roomCount < 3) {
    throw new Error(`Area "${area.id}" has insufficient roomCount (${area.roomCount}). Minimum is 3.`);
  }
  const rng = seededRandom(seed);
  const rooms: Record<string, Room> = {};
  const roomIds: string[] = [];

  // Create start room
  const startRoom: Room = {
    id: 'room_0',
    name: 'Entrance',
    description: `The entrance to ${area.name}.`,
    type: RoomType.Start,
    exits: [],
    encounterChance: 0,
    treasureChance: 0.1,
    treasurePool: [{ itemId: 'potion_small', weight: 10 }],
    cleared: true,
  };
  rooms['room_0'] = startRoom;
  roomIds.push('room_0');

  // Create normal rooms
  const normalCount = area.roomCount - 2;
  for (let i = 0; i < normalCount; i++) {
    const nameIdx = randomInRange(rng, 0, ROOM_NAMES.length - 1);
    const descIdx = randomInRange(rng, 0, ROOM_DESCRIPTIONS.length - 1);
    const depth = (i + 1) / normalCount;
    const room: Room = {
      id: `room_${i + 1}`,
      name: ROOM_NAMES[nameIdx],
      description: ROOM_DESCRIPTIONS[descIdx],
      type: RoomType.Normal,
      exits: [],
      encounterChance: 0.3 + depth * 0.3,
      treasureChance: 0.15 + depth * 0.1,
      treasurePool: [
        { itemId: 'potion_small', weight: 10 },
        { itemId: 'potion_medium', weight: 5 },
        { itemId: 'ether_small', weight: 3 },
      ],
      cleared: false,
    };
    rooms[room.id] = room;
    roomIds.push(room.id);
  }

  // Create boss room
  const bossRoom: Room = {
    id: `room_${normalCount + 1}`,
    name: 'Boss Chamber',
    description: `The ${area.bossId} awaits in the final chamber.`,
    type: RoomType.Boss,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: false,
  };
  rooms[bossRoom.id] = bossRoom;
  roomIds.push(bossRoom.id);

  // Build exits: create a linear path with some branches
  for (let i = 0; i < roomIds.length - 1; i++) {
    const fromRoom = rooms[roomIds[i]];
    const toRoom = rooms[roomIds[i + 1]];
    const dir = randomInRange(rng, 0, 7) as Directions;
    fromRoom.exits.push({ direction: dir, roomId: toRoom.id, label: toRoom.name });
    const oppositeDir = getOppositeDirection(dir);
    toRoom.exits.push({ direction: oppositeDir, roomId: fromRoom.id, label: fromRoom.name });
  }

  // Add some cross-connections for interesting dungeon topology
  if (roomIds.length > 3) {
    const extraConnections = Math.min(2, Math.floor(roomIds.length / 3));
    for (let c = 0; c < extraConnections; c++) {
      const fromIdx = randomInRange(rng, 1, roomIds.length - 2);
      const toIdx = randomInRange(rng, 1, roomIds.length - 2);
      if (fromIdx !== toIdx) {
        const fromRoom = rooms[roomIds[fromIdx]];
        const toRoom = rooms[roomIds[toIdx]];
        if (!fromRoom.exits.some((e) => e.roomId === toRoom.id)) {
          const dir = randomInRange(rng, 0, 7) as Directions;
          fromRoom.exits.push({ direction: dir, roomId: toRoom.id, label: toRoom.name });
          const oppositeDir = getOppositeDirection(dir);
          toRoom.exits.push({ direction: oppositeDir, roomId: fromRoom.id, label: fromRoom.name });
        }
      }
    }
  }

  return {
    areaId: area.id,
    currentRoomId: 'room_0',
    party: [],
    partyHp: {},
    partyMp: {},
    inventory: { currency: 0, items: [] },
    rooms,
  };
}

function getOppositeDirection(dir: Directions): Directions {
  const opposites: Record<Directions, Directions> = {
    [Directions.North]: Directions.South,
    [Directions.South]: Directions.North,
    [Directions.East]: Directions.West,
    [Directions.West]: Directions.East,
    [Directions.Northeast]: Directions.Southwest,
    [Directions.Southeast]: Directions.Northwest,
    [Directions.Northwest]: Directions.Southeast,
    [Directions.Southwest]: Directions.Northeast,
  };
  return opposites[dir];
}

/**
 * Roll for a random encounter in the given room.
 */
export function rollEncounter(room: Room, rng: () => number): boolean {
  return rng() < room.encounterChance;
}

/**
 * Roll for treasure in the given room.
 */
export function rollTreasure(room: Room, rng: () => number): boolean {
  return rng() < room.treasureChance;
}

/**
 * Select a random treasure item from the room's pool using weighted random.
 */
export function selectTreasure(room: Room, rng: () => number): string | null {
  if (room.treasurePool.length === 0) return null;
  const idx = weightedRandom(rng, room.treasurePool);
  return room.treasurePool[idx].itemId;
}

/**
 * Select a random enemy from the area's encounter pool.
 */
export function selectEnemy(area: Area, rng: () => number): string | null {
  if (area.encounterPool.length === 0) return null;
  const idx = randomInRange(rng, 0, area.encounterPool.length - 1);
  return area.encounterPool[idx];
}

/**
 * Validate that a move from one room to another is possible via exits.
 */
export function validateMove(fromRoom: Room, toRoomId: string): boolean {
  return fromRoom.exits.some((exit) => exit.roomId === toRoomId);
}
