import { describe, it, expect } from 'vitest';
import { generateDungeon, rollRoomTreasure, roomRollSeed } from '../dungeonEngine';
import { seededRandom } from '../mathUtils';
import { AREAS } from '../../data/areas';

/**
 * "Do players find loot now?" — simulate 500 fully explored runs per area.
 * Generation and first-visit treasure rolls are the same pure functions the
 * explore route uses, so the printed averages are the route's real rates.
 */
describe('dungeon loot rate', () => {
  const SEEDS = 500;

  it('averages at least 1.5 chests per full-clear run in every area', () => {
    const averages: Record<string, number> = {};

    for (const area of Object.values(AREAS)) {
      let chests = 0;

      for (let seed = 1; seed <= SEEDS; seed++) {
        const dungeon = generateDungeon(area, seed);
        for (const room of Object.values(dungeon.rooms)) {
          // First visit: one room-seeded rng, exactly as the route derives it.
          const rng = seededRandom(roomRollSeed(seed, room.id));
          if (rollRoomTreasure(room, rng)) chests++;
        }
      }

      const average = chests / SEEDS;
      averages[area.id] = average;
      console.log(`${area.name}: ${average.toFixed(2)} chests/run`);
    }

    console.log('Chests per full-clear run:', averages);
    for (const [areaId, average] of Object.entries(averages)) {
      expect(average, areaId).toBeGreaterThanOrEqual(1.5);
    }
  });
});
