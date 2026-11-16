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

  it('averages at least 1.5 chests and 0.2 charms per full-clear run in every area', () => {
    const averages: Record<string, number> = {};
    const charmAverages: Record<string, number> = {};

    for (const area of Object.values(AREAS)) {
      let chests = 0;
      let charms = 0;

      for (let seed = 1; seed <= SEEDS; seed++) {
        const dungeon = generateDungeon(area, seed);
        for (const room of Object.values(dungeon.rooms)) {
          // First visit: one room-seeded rng, exactly as the route derives it.
          const rng = seededRandom(roomRollSeed(seed, room.id));
          const rolled = rollRoomTreasure(room, rng);
          if (rolled) {
            chests++;
            if (rolled.charm) charms++;
          }
        }
      }

      const average = chests / SEEDS;
      const charmAverage = charms / SEEDS;
      averages[area.id] = average;
      charmAverages[area.id] = charmAverage;
      console.log(`${area.name}: ${average.toFixed(2)} chests/run, ${charmAverage.toFixed(2)} charms/run`);
    }

    console.log('Chests per full-clear run:', averages);
    console.log('Charms per full-clear run:', charmAverages);
    for (const [areaId, average] of Object.entries(averages)) {
      expect(average, areaId).toBeGreaterThanOrEqual(1.5);
    }
    for (const [areaId, average] of Object.entries(charmAverages)) {
      expect(average, areaId).toBeGreaterThanOrEqual(0.2);
    }
  });
});
