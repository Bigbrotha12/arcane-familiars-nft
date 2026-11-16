import { describe, it, expect } from 'vitest';
import { buildRunSummary, summarizeRunLoot } from '../runSummary';
import type { RunStats } from '../../types/exploration';
import type { RunLootSummary } from '../runLoot';

function stats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    battlesWon: 3,
    elitesWon: 1,
    roomsExplored: 5,
    chestsOpened: 2,
    curiosUsed: 1,
    xpByFamiliar: { whiteDog: 120 },
    levelsByFamiliar: { whiteDog: 2 },
    recruits: ['leafBunny'],
    bondGains: { leafBunny: 1 },
    learned: ['White Dog learned Sturdy'],
    passiveUnlocks: [],
    ...overrides,
  };
}

describe('buildRunSummary', () => {
  it('builds a cleared summary with banked loot', () => {
    const loot: RunLootSummary = {
      currency: 220,
      items: [
        { itemId: 'potion_small', quantity: 2 },
        { itemId: 'fire_bomb', quantity: 1 },
      ],
      charms: [{ uid: 'c1', baseId: 'emberBand', rarity: 'rare', mods: [{ stat: 'attack', pct: 7 }] }],
    };

    const summary = buildRunSummary({
      outcome: 'cleared',
      areaId: 'verdantMeadow',
      stats: stats(),
      loot,
    });

    expect(summary.outcome).toBe('cleared');
    expect(summary.areaId).toBe('verdantMeadow');
    expect(summary.areaName).toBe('Verdant Meadow');
    expect(summary.stats).toEqual(stats());
    expect(summary.loot).toEqual({
      currency: 220,
      items: ['potion_small', 'potion_small', 'fire_bomb'],
      charms: 1,
    });
    expect(summary.lost).toBeUndefined();
  });

  it('builds a retreated summary with the banked loot', () => {
    const summary = buildRunSummary({
      outcome: 'retreated',
      areaId: 'crystalCaves',
      areaName: 'Custom Name',
      stats: stats(),
      loot: { currency: 40, items: [{ itemId: 'ether_small', quantity: 1 }] },
    });

    expect(summary.outcome).toBe('retreated');
    expect(summary.areaName).toBe('Custom Name');
    expect(summary.loot.items).toEqual(['ether_small']);
  });

  it('builds a defeated summary with lost loot and no banked loot', () => {
    const lost: RunLootSummary = {
      currency: 75,
      items: [{ itemId: 'potion_medium', quantity: 1 }],
    };

    const summary = buildRunSummary({
      outcome: 'defeated',
      areaId: 'shadowForest',
      stats: stats({ battlesWon: 2 }),
      lost,
    });

    expect(summary.outcome).toBe('defeated');
    expect(summary.loot).toEqual({ currency: 0, items: [] });
    expect(summary.lost).toEqual({ currency: 75, items: ['potion_medium'] });
  });
});

describe('summarizeRunLoot', () => {
  it('handles empty loot and zero-quantity entries', () => {
    expect(summarizeRunLoot()).toEqual({ currency: 0, items: [] });
    expect(summarizeRunLoot({ currency: 5, items: [{ itemId: 'potion_small', quantity: 0 }] })).toEqual({
      currency: 5,
      items: [],
    });
  });
});
