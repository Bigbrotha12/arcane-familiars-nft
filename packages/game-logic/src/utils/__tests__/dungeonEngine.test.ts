import { describe, it, expect } from 'vitest';
import {
  generateDungeon,
  healPartyAtRest,
  rollEncounter,
  rollTreasure,
  selectTreasure,
  selectEnemy,
  validateMove,
} from '../dungeonEngine';
import { seededRandom } from '../mathUtils';
import { AREAS } from '../../data/areas';
import { BALANCE } from '../../data/balance';
import { RoomType } from '../../types/exploration';
import type { Room, DungeonState } from '../../types/exploration';

function makeRng(seed = 42): () => number {
  return seededRandom(seed);
}

describe('generateDungeon', () => {
  const area = AREAS.verdantMeadow;

  it('generates the correct number of rooms', () => {
    const dungeon = generateDungeon(area, 42);
    expect(Object.keys(dungeon.rooms).length).toBe(area.roomCount);
  });

  it("first room is 'start' type named 'Entrance'", () => {
    const dungeon = generateDungeon(area, 42);
    const first = dungeon.rooms['room_0'];
    expect(first.type).toBe(RoomType.Start);
    expect(first.name).toBe('Entrance');
  });

  it("last room is 'boss' type", () => {
    const dungeon = generateDungeon(area, 42);
    const ids = Object.keys(dungeon.rooms);
    expect(dungeon.rooms[ids[ids.length - 1]].type).toBe(RoomType.Boss);
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
    const ids = Object.keys(dungeon.rooms);
    const boss = dungeon.rooms[ids[ids.length - 1]];
    const prev = ids[ids.length - 2];
    expect(boss.exits.some((e) => e.roomId === prev)).toBe(true);
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
