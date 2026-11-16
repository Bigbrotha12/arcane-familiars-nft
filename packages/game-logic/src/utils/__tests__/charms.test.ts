import { describe, expect, it } from 'vitest';
import { CHARM_BASE_BY_ID, type CharmInstance } from '@/data/charms';
import {
  CHARM_SALVAGE,
  MAX_CHARMS,
  applyCharm,
  charmModsLabel,
  charmName,
  equippedCharm,
  rollCharm,
} from '@/utils/charms';
import { seededRandom } from '@/utils/mathUtils';
import { rollChest } from '@/utils/dungeonEngine';
import { bankRunLoot, discardRunLoot } from '@/utils/runLoot';
import type { GameState } from '@/types/gameState';

function charm(uid: string, overrides: Partial<CharmInstance> = {}): CharmInstance {
  return {
    uid,
    baseId: 'emberBand',
    rarity: 'common',
    mods: [{ stat: 'attack', pct: 10 }],
    ...overrides,
  };
}

describe('rollCharm', () => {
  it('common charms have one primary mod in the 4-6% band', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const charm = rollCharm('common', seededRandom(seed));
      const primary = CHARM_BASE_BY_ID[charm.baseId].primary;
      expect(charm.rarity).toBe('common');
      expect(charm.mods).toHaveLength(1);
      expect(charm.mods[0].stat).toBe(primary);
      expect(charm.mods[0].pct).toBeGreaterThanOrEqual(4);
      expect(charm.mods[0].pct).toBeLessThanOrEqual(6);
    }
  });

  it('uncommon charms add a different second stat in the 5-8% band', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const charm = rollCharm('uncommon', seededRandom(seed));
      const primary = CHARM_BASE_BY_ID[charm.baseId].primary;
      expect(charm.mods).toHaveLength(2);
      expect(charm.mods[0].stat).toBe(primary);
      expect(new Set(charm.mods.map((mod) => mod.stat)).size).toBe(2);
      for (const mod of charm.mods) {
        expect(mod.pct).toBeGreaterThanOrEqual(5);
        expect(mod.pct).toBeLessThanOrEqual(8);
      }
    }
  });

  it('rare charms have three different stats in the 6-10% band', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const charm = rollCharm('rare', seededRandom(seed));
      expect(charm.mods).toHaveLength(3);
      expect(new Set(charm.mods.map((mod) => mod.stat)).size).toBe(3);
      for (const mod of charm.mods) {
        expect(mod.pct).toBeGreaterThanOrEqual(6);
        expect(mod.pct).toBeLessThanOrEqual(10);
      }
    }
  });

  it('is deterministic for a seeded rng', () => {
    expect(rollCharm('rare', seededRandom(99))).toEqual(rollCharm('rare', seededRandom(99)));
  });
});

describe('charm display helpers', () => {
  it('names the second mod with its suffix', () => {
    expect(charmName({ baseId: 'emberBand', mods: [{ stat: 'attack', pct: 7 }] })).toBe('Ember Band');
    expect(
      charmName({
        baseId: 'emberBand',
        mods: [
          { stat: 'attack', pct: 7 },
          { stat: 'speed', pct: 6 },
        ],
      })
    ).toBe('Ember Band of Wind');
  });

  it('formats mods in roll order', () => {
    expect(
      charmModsLabel({
        mods: [
          { stat: 'attack', pct: 7 },
          { stat: 'speed', pct: 5 },
        ],
      })
    ).toBe('+7% Attack · +5% Speed');
  });
});

describe('applyCharm', () => {
  const stats = {
    hp: 100,
    maxHp: 100,
    mp: 40,
    maxMp: 40,
    attack: 100,
    defense: 100,
    arcane: 100,
    speed: 100,
  };

  it('scales only combat stats, rounds, and leaves the input untouched', () => {
    const charm = {
      mods: [
        { stat: 'attack' as const, pct: 10 },
        { stat: 'defense' as const, pct: 7 },
      ],
    };
    const result = applyCharm(stats, charm);
    expect(result).not.toBe(stats);
    expect(result.attack).toBe(110);
    expect(result.defense).toBe(107);
    expect(result.arcane).toBe(100);
    expect(result.speed).toBe(100);
    expect(result.hp).toBe(100);
    expect(result.maxHp).toBe(100);
    expect(result.mp).toBe(40);
    expect(stats.attack).toBe(100);
  });

  it('rounds fractional results', () => {
    const result = applyCharm({ ...stats, attack: 33 }, { mods: [{ stat: 'attack', pct: 5 }] });
    expect(result.attack).toBe(35);
  });
});

describe('charm drops', () => {
  it('epic chests always contain a rare charm', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const chest = rollChest('epic', seededRandom(seed));
      expect(chest.charm?.rarity).toBe('rare');
    }
  });

  it('rare chests can contain an uncommon charm', () => {
    const charms = Array.from({ length: 200 }, (_, index) => rollChest('rare', seededRandom(index + 1)).charm);
    expect(charms.some((charm) => charm?.rarity === 'uncommon')).toBe(true);
  });
});

describe('charm run loot', () => {
  function runState(runCharms: CharmInstance[]): GameState {
    return {
      inventory: { currency: 0, items: [] },
      charms: [],
      dungeon: { runCharms } as unknown as GameState['dungeon'],
    } as unknown as GameState;
  }

  it('banks run charms and reports them', () => {
    const state = runState([charm('run1')]);
    const summary = bankRunLoot(state);
    expect(summary.charms?.map((entry) => entry.uid)).toEqual(['run1']);
    expect(state.charms?.map((entry) => entry.uid)).toEqual(['run1']);
    expect(state.dungeon?.runCharms).toEqual([]);
  });

  it('auto-salvages charms over the cap into coins and reports them', () => {
    const state = runState([charm('extra', { rarity: 'rare' })]);
    state.charms = Array.from({ length: MAX_CHARMS }, (_, index) => charm(`owned-${index}`));
    const summary = bankRunLoot(state);
    expect(state.charms).toHaveLength(MAX_CHARMS);
    expect(state.inventory.currency).toBe(60);
    expect(summary.salvagedCharms?.map((entry) => entry.uid)).toEqual(['extra']);
    expect(summary.salvageCurrency).toBe(60);
  });

  it('loses run charms on defeat without touching the collection', () => {
    const state = runState([charm('run1')]);
    state.charms = [charm('owned')];
    const lost = discardRunLoot(state);
    expect(lost.charms?.map((entry) => entry.uid)).toEqual(['run1']);
    expect(state.charms?.map((entry) => entry.uid)).toEqual(['owned']);
    expect(state.dungeon?.runCharms).toEqual([]);
  });
});

describe('charm constants', () => {
  it('has the agreed salvage values and cap', () => {
    expect(CHARM_SALVAGE).toEqual({ common: 10, uncommon: 25, rare: 60 });
    expect(MAX_CHARMS).toBe(40);
  });

  it('finds a familiar’s equipped charm', () => {
    const state = {
      charms: [
        { uid: 'a', baseId: 'emberBand', rarity: 'common' as const, mods: [], equippedTo: 'whiteDog' },
        { uid: 'b', baseId: 'stoneLocket', rarity: 'common' as const, mods: [] },
      ],
    } as unknown as GameState;
    expect(equippedCharm(state, 'whiteDog')?.uid).toBe('a');
    expect(equippedCharm(state, 'yellowFighter')).toBeUndefined();
  });

  it('returns undefined for old saves without charms', () => {
    expect(equippedCharm({}, 'whiteDog')).toBeUndefined();
    expect(equippedCharm(null, 'whiteDog')).toBeUndefined();
  });
});
