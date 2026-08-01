import { describe, it, expect } from "vitest";
import { generateDungeon, rollEncounter, rollTreasure, selectTreasure, selectEnemy, scaleEnemy, validateMove } from "../dungeonEngine";
import { seededRandom } from "../mathUtils";
import { AREAS } from "../../data/areas";
import { getFamiliar } from "../../data/familiars";
import { RoomType } from "../../types/exploration";
import type { Room, Area } from "../../types/exploration";

function makeRng(seed = 42): () => number {
  return seededRandom(seed);
}

describe("generateDungeon", () => {
  const area = AREAS.verdantMeadow;

  it("generates the correct number of rooms", () => {
    const dungeon = generateDungeon(area, 42);
    expect(Object.keys(dungeon.rooms).length).toBe(area.roomCount);
  });

  it("first room is 'start' type named 'Entrance'", () => {
    const dungeon = generateDungeon(area, 42);
    const first = dungeon.rooms["room_0"];
    expect(first.type).toBe(RoomType.Start);
    expect(first.name).toBe("Entrance");
  });

  it("last room is 'boss' type", () => {
    const dungeon = generateDungeon(area, 42);
    const ids = Object.keys(dungeon.rooms);
    expect(dungeon.rooms[ids[ids.length - 1]].type).toBe(RoomType.Boss);
  });

  it("all rooms have at least 1 exit", () => {
    const dungeon = generateDungeon(area, 42);
    for (const room of Object.values(dungeon.rooms)) {
      expect(room.exits.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("same seed produces identical dungeon (determinism)", () => {
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

  it("different seed produces different dungeon", () => {
    const a = generateDungeon(area, 42);
    const b = generateDungeon(area, 99);
    expect(JSON.stringify(a.rooms)).not.toBe(JSON.stringify(b.rooms));
  });

  it("boss room has an exit back to previous room", () => {
    const dungeon = generateDungeon(area, 42);
    const ids = Object.keys(dungeon.rooms);
    const boss = dungeon.rooms[ids[ids.length - 1]];
    const prev = ids[ids.length - 2];
    expect(boss.exits.some((e) => e.roomId === prev)).toBe(true);
  });
});

describe("rollEncounter", () => {
  const base: Room = {
    id: "test",
    name: "Test",
    description: "",
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: false,
  };

  it("room with encounterChance 0 never encounters", () => {
    const rng = makeRng();
    for (let i = 0; i < 100; i++) {
      expect(rollEncounter(base, rng)).toBe(false);
    }
  });

  it("room with encounterChance 1.0 always encounters", () => {
    const room = { ...base, encounterChance: 1.0 };
    const rng = makeRng();
    for (let i = 0; i < 100; i++) {
      expect(rollEncounter(room, rng)).toBe(true);
    }
  });
});

describe("rollTreasure", () => {
  const base: Room = {
    id: "test",
    name: "Test",
    description: "",
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: false,
  };

  it("room with treasureChance 0 never has treasure", () => {
    const rng = makeRng();
    for (let i = 0; i < 100; i++) {
      expect(rollTreasure(base, rng)).toBe(false);
    }
  });

  it("room with treasureChance 1.0 always has treasure", () => {
    const room = { ...base, treasureChance: 1.0 };
    const rng = makeRng();
    for (let i = 0; i < 100; i++) {
      expect(rollTreasure(room, rng)).toBe(true);
    }
  });
});

describe("selectTreasure", () => {
  const base: Room = {
    id: "test",
    name: "Test",
    description: "",
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: false,
  };

  it("empty treasure pool returns null", () => {
    expect(selectTreasure(base, makeRng())).toBeNull();
  });

  it("single item pool returns that item", () => {
    const room = { ...base, treasurePool: [{ itemId: "potion_small", weight: 10 }] };
    expect(selectTreasure(room, makeRng())).toBe("potion_small");
  });

  it("weighted selection with deterministic seed", () => {
    const room = {
      ...base,
      treasurePool: [
        { itemId: "potion_small", weight: 10 },
        { itemId: "potion_medium", weight: 5 },
        { itemId: "ether_small", weight: 3 },
      ],
    };
    const result = selectTreasure(room, makeRng(42));
    expect(["potion_small", "potion_medium", "ether_small"]).toContain(result);
    expect(selectTreasure(room, makeRng(42))).toBe(selectTreasure(room, makeRng(42)));
  });
});

describe("selectEnemy", () => {
  it("returns a string from the area's encounter pool", () => {
    const area = AREAS.verdantMeadow;
    const enemy = selectEnemy(area, makeRng(42));
    expect(area.encounterPool).toContain(enemy);
  });

  it("with seeded RNG, returns deterministic results", () => {
    const area = AREAS.verdantMeadow;
    expect(selectEnemy(area, makeRng(55))).toBe(selectEnemy(area, makeRng(55)));
  });
});

describe("scaleEnemy", () => {
  it("level 1 returns stats unchanged (scale = 1.0)", () => {
    const base = getFamiliar("whiteDog")!;
    const scaled = scaleEnemy(base, 1);
    expect(scaled.stats).toEqual(base.stats);
  });

  it("level 5 scales stats by 1.4", () => {
    const base = getFamiliar("whiteDog")!;
    const scaled = scaleEnemy(base, 5);
    for (const key of ["hp", "maxHp", "mp", "maxMp", "attack", "defense", "arcane", "speed"] as const) {
      expect(scaled.stats[key]).toBe(Math.round(base.stats[key] * 1.4));
    }
  });

  it("all scaled values are rounded integers", () => {
    const base = getFamiliar("yellowFighter")!;
    const scaled = scaleEnemy(base, 3);
    for (const key of ["hp", "mp", "attack", "defense", "arcane", "speed"] as const) {
      expect(Number.isInteger(scaled.stats[key])).toBe(true);
    }
  });

  it("non-stat properties are preserved", () => {
    const base = getFamiliar("whiteDog")!;
    const scaled = scaleEnemy(base, 5);
    expect(scaled.id).toBe(base.id);
    expect(scaled.name).toBe(base.name);
    expect(scaled.description).toBe(base.description);
    expect(scaled.abilities).toEqual(base.abilities);
    expect(scaled.affinity).toBe(base.affinity);
    expect(scaled.rarity).toBe(base.rarity);
  });
});

describe("validateMove", () => {
  const dungeon = generateDungeon(AREAS.verdantMeadow, 42);

  it("valid exit returns true", () => {
    const from = dungeon.rooms["room_0"];
    expect(validateMove(from, from.exits[0].roomId)).toBe(true);
  });

  it("invalid exit returns false", () => {
    const from = dungeon.rooms["room_0"];
    expect(validateMove(from, "nonexistent")).toBe(false);
  });

  it("two connected rooms validate mutually", () => {
    const roomA = dungeon.rooms["room_0"];
    const roomB = dungeon.rooms[roomA.exits[0].roomId];
    expect(validateMove(roomA, roomB.id)).toBe(true);
    expect(roomB.exits.some((e) => e.roomId === roomA.id)).toBe(true);
  });

  it("unconnected rooms return false", () => {
    const room0 = dungeon.rooms["room_0"];
    const unconnected = Object.keys(dungeon.rooms).find(
      (id) => id !== "room_0" && !room0.exits.some((e) => e.roomId === id),
    );
    if (unconnected) {
      expect(validateMove(room0, unconnected)).toBe(false);
    }
  });
});
