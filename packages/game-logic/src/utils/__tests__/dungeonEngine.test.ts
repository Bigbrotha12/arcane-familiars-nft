import { describe, it, expect } from 'vitest';
import {
  generateDungeon,
  healPartyAtRest,
  rollChest,
  rollEncounter,
  rollRoomTreasure,
  rollTreasure,
  roomRollSeed,
  selectTreasure,
  selectEnemy,
  validateMove,
} from '../dungeonEngine';
import { seededRandom } from '../mathUtils';
import { AREAS } from '../../data/areas';
import { BALANCE } from '../../data/balance';
import { ITEMS, itemRarity } from '../../data/items';
import { RoomType } from '../../types/exploration';
import type { Room, DungeonState } from '../../types/exploration';

function makeRng(seed = 42): () => number {
  return seededRandom(seed);
}

describe('generateDungeon', () => {
  const area = AREAS.verdantMeadow;

  it('generates the correct number of rooms (main path plus side branches)', () => {
    const dungeon = generateDungeon(area, 42);
    const branchCount = area.roomCount <= 6 ? 1 : 2;
    expect(Object.keys(dungeon.rooms).length).toBe(area.roomCount + branchCount);
  });

  it("first room is 'start' type named 'Entrance'", () => {
    const dungeon = generateDungeon(area, 42);
    const first = dungeon.rooms['room_0'];
    expect(first.type).toBe(RoomType.Start);
    expect(first.name).toBe('Entrance');
  });

  it("last main-path room is 'boss' type", () => {
    const dungeon = generateDungeon(area, 42);
    expect(dungeon.rooms[`room_${area.roomCount - 1}`].type).toBe(RoomType.Boss);
  });

  it('all rooms have at least 1 exit', () => {
    const dungeon = generateDungeon(area, 42);
    for (const room of Object.values(dungeon.rooms)) {
      expect(room.exits.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('same seed produces identical dungeon (determinism)', () => {
    const a = generateDungeon(area, 42);
    const b = generateDungeon(area, 42);
    const ids = Object.keys(a.rooms);
    expect(Object.keys(b.rooms)).toEqual(ids);
    for (const id of ids) {
      expect(b.rooms[id].name).toBe(a.rooms[id].name);
      expect(b.rooms[id].description).toBe(a.rooms[id].description);
      expect(b.rooms[id].type).toBe(a.rooms[id].type);

      expect(b.rooms[id].exits).toEqual(a.rooms[id].exits);
    }
  });

  it('different seed produces different dungeon', () => {
    const a = generateDungeon(area, 42);
    const b = generateDungeon(area, 99);
    expect(JSON.stringify(a.rooms)).not.toBe(JSON.stringify(b.rooms));
  });

  it('boss room has an exit back to previous room', () => {
    const dungeon = generateDungeon(area, 42);
    const boss = Object.values(dungeon.rooms).find((room) => room.type === RoomType.Boss);
    const prev = `room_${area.roomCount - 2}`;
    expect(boss).toBeDefined();
    expect(boss!.exits.some((e) => e.roomId === prev)).toBe(true);
  });
});

describe('dead-end branch generation', () => {
  const expectedBranches = (roomCount: number): number => (roomCount <= 6 ? 1 : 2);

  it('adds 1 branch for short dungeons and 2 for longer ones', () => {
    for (const area of Object.values(AREAS)) {
      const dungeon = generateDungeon(area, 17);
      const branches = Object.values(dungeon.rooms).filter((room) => room.type === RoomType.Deadend);
      expect(branches, area.id).toHaveLength(expectedBranches(area.roomCount));
      expect(branches.map((room) => room.id).sort()).toEqual(
        Array.from({ length: expectedBranches(area.roomCount) }, (_, i) => `branch_${i + 1}`)
      );
    }
  });

  it('makes each branch a leaf with a guaranteed rare chest', () => {
    for (const area of Object.values(AREAS)) {
      const dungeon = generateDungeon(area, 42);
      for (const branch of Object.values(dungeon.rooms).filter((room) => room.type === RoomType.Deadend)) {
        expect(branch.exits, `${area.id}/${branch.id}`).toHaveLength(1);
        expect(branch.chest).toBe('rare');
        expect(branch.encounterChance).toBe(0.6);
        expect(branch.treasureChance).toBe(1);
        expect(branch.cleared).toBe(false);
      }
    }
  });

  it('attaches branches to distinct normal main-path rooms only', () => {
    for (const area of Object.values(AREAS)) {
      const dungeon = generateDungeon(area, 99);
      const hosts = Object.values(dungeon.rooms)
        .filter((room) => room.type === RoomType.Deadend)
        .map((branch) => dungeon.rooms[branch.exits[0].roomId]);

      expect(hosts.length).toBe(expectedBranches(area.roomCount));
      for (const host of hosts) {
        expect(host).toBeDefined();
        expect(host.type).toBe(RoomType.Normal);
        expect(host.id).toMatch(/^room_\d+$/);
      }
      // Never two branches on the same host.
      expect(new Set(hosts.map((host) => host.id)).size).toBe(hosts.length);
      for (const host of hosts) {
        expect(host.exits.filter((exit) => exit.roomId.startsWith('branch_')).length).toBe(1);
      }
    }
  });

  it('keeps every main-path room and the boss reachable from the entrance', () => {
    for (const area of Object.values(AREAS)) {
      const dungeon = generateDungeon(area, 23);
      const seen = new Set<string>(['room_0']);
      const queue = ['room_0'];
      while (queue.length > 0) {
        const room = dungeon.rooms[queue.shift()!];
        for (const exit of room.exits) {
          if (seen.has(exit.roomId)) continue;
          seen.add(exit.roomId);
          queue.push(exit.roomId);
        }
      }
      const boss = Object.values(dungeon.rooms).find((room) => room.type === RoomType.Boss);
      expect(boss).toBeDefined();
      expect(seen.has(boss!.id), area.id).toBe(true);
      expect(seen.size, area.id).toBe(Object.keys(dungeon.rooms).length);
    }
  });

  it('is deterministic per seed, branches included', () => {
    for (const area of Object.values(AREAS)) {
      const a = generateDungeon(area, 314);
      const b = generateDungeon(area, 314);
      expect(JSON.stringify(b.rooms)).toBe(JSON.stringify(a.rooms));
    }
  });
});

describe('rest shrine generation', () => {
  function restRooms(dungeon: DungeonState): Room[] {
    return Object.values(dungeon.rooms).filter((room) => room.type === RoomType.Rest);
  }

  it('places exactly one shrine in areas with 6+ rooms and none below that', () => {
    for (const area of Object.values(AREAS)) {
      const shrines = restRooms(generateDungeon(area, 7));
      expect(shrines, `${area.id} (roomCount ${area.roomCount})`).toHaveLength(area.roomCount >= 6 ? 1 : 0);
    }
  });

  it('marks the shrine as a safe room with the designed name and description', () => {
    const shrine = restRooms(generateDungeon(AREAS.crystalCaves, 7))[0];
    expect(shrine.name).toBe('Quiet Shrine');
    expect(shrine.description).toBe('Soft light pools around an old stone shrine.');
    expect(shrine.encounterChance).toBe(0);
    expect(shrine.treasureChance).toBe(0);
    expect(shrine.treasurePool).toEqual([]);
    expect(shrine.rested).toBeUndefined();
  });

  it('never replaces the start or boss room', () => {
    for (const area of Object.values(AREAS)) {
      const dungeon = generateDungeon(area, 11);
      const shrine = restRooms(dungeon)[0];
      if (!shrine) continue;
      expect(shrine.id).not.toBe('room_0');
      expect(shrine.type).not.toBe(RoomType.Boss);
      const boss = Object.values(dungeon.rooms).find((room) => room.type === RoomType.Boss);
      expect(shrine.id).not.toBe(boss?.id);
    }
  });

  it('sits in the last normal room, immediately before the boss', () => {
    for (const area of Object.values(AREAS)) {
      const dungeon = generateDungeon(area, 42);
      const shrine = restRooms(dungeon)[0];
      if (area.roomCount < 6) {
        expect(shrine).toBeUndefined();
        continue;
      }
      const boss = Object.values(dungeon.rooms).find((room) => room.type === RoomType.Boss);
      const bossExitRooms = Object.values(dungeon.rooms).filter((room) =>
        room.exits.some((exit) => exit.roomId === boss?.id)
      );
      expect(shrine).toBeDefined();
      // The chain is linear, so the shrine is the room that leads into the boss.
      expect(bossExitRooms.map((room) => room.id)).toContain(shrine.id);
    }
  });

  it('keeps every room reachable from the entrance', () => {
    for (const area of Object.values(AREAS)) {
      const dungeon = generateDungeon(area, 23);
      const seen = new Set<string>(['room_0']);
      const queue = ['room_0'];
      while (queue.length > 0) {
        const room = dungeon.rooms[queue.shift()!];
        for (const exit of room.exits) {
          if (seen.has(exit.roomId)) continue;
          seen.add(exit.roomId);
          queue.push(exit.roomId);
        }
      }
      expect(seen.size, area.id).toBe(Object.keys(dungeon.rooms).length);
    }
  });
});

describe('healPartyAtRest', () => {
  function dungeonWithParty(hp: Record<string, number>, mp: Record<string, number>): DungeonState {
    const dungeon = generateDungeon(AREAS.crystalCaves, 42);
    dungeon.party = Object.keys(hp);
    dungeon.partyHp = { ...hp };
    dungeon.partyMp = { ...mp };
    return dungeon;
  }

  it('restores the configured fraction of max HP and MP', () => {
    const dungeon = dungeonWithParty({ whiteDog: 40 }, { whiteDog: 10 });
    const healed = healPartyAtRest(dungeon);

    const expectedHp = Math.round(120 * BALANCE.restHealFraction);
    const expectedMp = Math.round(80 * BALANCE.restHealFraction);
    expect(healed.whiteDog).toEqual({ hp: expectedHp, mp: expectedMp });
    expect(dungeon.partyHp.whiteDog).toBe(40 + expectedHp);
    expect(dungeon.partyMp.whiteDog).toBe(10 + expectedMp);
  });

  it('caps healing at the level-scaled max and reports only the amount restored', () => {
    const dungeon = dungeonWithParty({ whiteDog: 100 }, { whiteDog: 60 });
    const healed = healPartyAtRest(dungeon);

    expect(healed.whiteDog).toEqual({ hp: 20, mp: 20 });
    expect(dungeon.partyHp.whiteDog).toBe(120);
    expect(dungeon.partyMp.whiteDog).toBe(80);
  });

  it('uses familiar levels when computing the cap', () => {
    const dungeon = dungeonWithParty({ whiteDog: 100 }, { whiteDog: 60 });
    healPartyAtRest(dungeon, { whiteDog: 2 });

    expect(dungeon.partyHp.whiteDog).toBe(127);
    expect(dungeon.partyMp.whiteDog).toBe(85);
  });

  it('skips fainted members and never revives them', () => {
    const dungeon = dungeonWithParty({ whiteDog: 40, yellowFighter: 0 }, { whiteDog: 10, yellowFighter: 30 });
    const healed = healPartyAtRest(dungeon);

    expect(healed.yellowFighter).toBeUndefined();
    expect(dungeon.partyHp.yellowFighter).toBe(0);
    expect(dungeon.partyMp.yellowFighter).toBe(30);
    expect(healed.whiteDog.hp).toBeGreaterThan(0);
  });
});

describe('rollEncounter', () => {
  const base: Room = {
    id: 'test',
    name: 'Test',
    description: '',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: false,
  };

  it('room with encounterChance 0 never encounters', () => {
    const rng = makeRng();
    for (let i = 0; i < 100; i++) {
      expect(rollEncounter(base, rng)).toBe(false);
    }
  });

  it('room with encounterChance 1.0 always encounters', () => {
    const room = { ...base, encounterChance: 1.0 };
    const rng = makeRng();
    for (let i = 0; i < 100; i++) {
      expect(rollEncounter(room, rng)).toBe(true);
    }
  });
});

describe('rollTreasure', () => {
  const base: Room = {
    id: 'test',
    name: 'Test',
    description: '',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: false,
  };

  it('room with treasureChance 0 never has treasure', () => {
    const rng = makeRng();
    for (let i = 0; i < 100; i++) {
      expect(rollTreasure(base, rng)).toBe(false);
    }
  });

  it('room with treasureChance 1.0 always has treasure', () => {
    const room = { ...base, treasureChance: 1.0 };
    const rng = makeRng();
    for (let i = 0; i < 100; i++) {
      expect(rollTreasure(room, rng)).toBe(true);
    }
  });
});

describe('rollChest', () => {
  it('common chests hold one item and no coins', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const chest = rollChest('common', seededRandom(seed));
      expect(chest.items).toHaveLength(1);
      expect(chest.currency).toBe(0);
      expect(ITEMS[chest.items[0]]).toBeDefined();
    }
  });

  it('rare chests hold two items, 30-60 coins and one uncommon-or-better item', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const chest = rollChest('rare', seededRandom(seed));
      expect(chest.items).toHaveLength(2);
      expect(chest.currency).toBeGreaterThanOrEqual(30);
      expect(chest.currency).toBeLessThanOrEqual(60);
      expect(chest.items.some((id) => itemRarity(ITEMS[id]) !== 'common')).toBe(true);
    }
  });

  it('epic chests hold three items, 80-150 coins and one rare item', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const chest = rollChest('epic', seededRandom(seed));
      expect(chest.items).toHaveLength(3);
      expect(chest.currency).toBeGreaterThanOrEqual(80);
      expect(chest.currency).toBeLessThanOrEqual(150);
      expect(chest.items.some((id) => itemRarity(ITEMS[id]) === 'rare')).toBe(true);
    }
  });

  it('is deterministic for a seeded rng', () => {
    expect(rollChest('epic', seededRandom(77))).toEqual(rollChest('epic', seededRandom(77)));
    expect(rollChest('rare', seededRandom(77))).toEqual(rollChest('rare', seededRandom(77)));
  });
});

describe('rollRoomTreasure', () => {
  const base: Room = {
    id: 'test',
    name: 'Test',
    description: '',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [{ itemId: 'potion_small', weight: 10 }],
    cleared: false,
  };

  it('a room with a placed chest always yields that chest', () => {
    const room = { ...base, chest: 'rare' as const, encounterChance: 1, treasureChance: 0 };
    const rolled = rollRoomTreasure(room, seededRandom(5));
    expect(rolled?.tier).toBe('rare');
    expect(rolled?.items).toHaveLength(2);
    expect(rolled?.currency).toBeGreaterThanOrEqual(30);
  });

  it('rolls normal-room treasure independently of the encounter chance', () => {
    const room = { ...base, treasureChance: 1, encounterChance: 1 };
    const rolled = rollRoomTreasure(room, seededRandom(5));
    expect(rolled).not.toBeNull();
    expect(['common', 'rare']).toContain(rolled!.tier);
    expect(rolled!.items).toHaveLength(rolled!.tier === 'rare' ? 2 : 1);
  });

  it('returns null when the room has no chest and no treasure roll', () => {
    expect(rollRoomTreasure(base, seededRandom(5))).toBeNull();
  });

  it('roomRollSeed is deterministic per room and seed', () => {
    expect(roomRollSeed(42, 'room_2')).toBe(roomRollSeed(42, 'room_2'));
    expect(roomRollSeed(42, 'room_2')).not.toBe(roomRollSeed(42, 'room_3'));
  });
});

describe('selectTreasure', () => {
  const base: Room = {
    id: 'test',
    name: 'Test',
    description: '',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: false,
  };

  it('empty treasure pool returns null', () => {
    expect(selectTreasure(base, makeRng())).toBeNull();
  });

  it('single item pool returns that item', () => {
    const room = { ...base, treasurePool: [{ itemId: 'potion_small', weight: 10 }] };
    expect(selectTreasure(room, makeRng())).toBe('potion_small');
  });

  it('weighted selection with deterministic seed', () => {
    const room = {
      ...base,
      treasurePool: [
        { itemId: 'potion_small', weight: 10 },
        { itemId: 'potion_medium', weight: 5 },
        { itemId: 'ether_small', weight: 3 },
      ],
    };
    const result = selectTreasure(room, makeRng(42));
    expect(['potion_small', 'potion_medium', 'ether_small']).toContain(result);
    expect(selectTreasure(room, makeRng(42))).toBe(selectTreasure(room, makeRng(42)));
  });
});

describe('selectEnemy', () => {
  it("returns a string from the area's encounter pool", () => {
    const area = AREAS.verdantMeadow;
    const enemy = selectEnemy(area, makeRng(42));
    expect(area.encounterPool).toContain(enemy);
  });

  it('with seeded RNG, returns deterministic results', () => {
    const area = AREAS.verdantMeadow;
    expect(selectEnemy(area, makeRng(55))).toBe(selectEnemy(area, makeRng(55)));
  });
});

describe('validateMove', () => {
  const dungeon = generateDungeon(AREAS.verdantMeadow, 42);

  it('valid exit returns true', () => {
    const from = dungeon.rooms['room_0'];
    expect(validateMove(from, from.exits[0].roomId)).toBe(true);
  });

  it('invalid exit returns false', () => {
    const from = dungeon.rooms['room_0'];
    expect(validateMove(from, 'nonexistent')).toBe(false);
  });

  it('two connected rooms validate mutually', () => {
    const roomA = dungeon.rooms['room_0'];
    const roomB = dungeon.rooms[roomA.exits[0].roomId];
    expect(validateMove(roomA, roomB.id)).toBe(true);
    expect(roomB.exits.some((e) => e.roomId === roomA.id)).toBe(true);
  });

  it('unconnected rooms return false', () => {
    const room0 = dungeon.rooms['room_0'];
    const unconnected = Object.keys(dungeon.rooms).find(
      (id) => id !== 'room_0' && !room0.exits.some((e) => e.roomId === id)
    );
    if (unconnected) {
      expect(validateMove(room0, unconnected)).toBe(false);
    }
  });
});
