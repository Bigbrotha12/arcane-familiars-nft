import { describe, it, expect } from 'vitest';
import { dailyExpedition, fnv1a32 } from '../dailyExpedition';
import { AREAS } from '../../data/areas';

const ALL_AREAS = Object.keys(AREAS);

describe('dailyExpedition', () => {
  it('is stable for the same date and unlocked list', () => {
    const first = dailyExpedition('2026-11-16', ['verdantMeadow', 'crystalCaves']);
    const second = dailyExpedition('2026-11-16', ['crystalCaves', 'verdantMeadow']);
    expect(second).toEqual(first);
  });

  it('changes seed across dates', () => {
    const a = dailyExpedition('2026-11-16', ALL_AREAS);
    const b = dailyExpedition('2026-11-17', ALL_AREAS);
    expect(a.seed).not.toBe(b.seed);
    expect(fnv1a32('2026-11-16')).toBe(a.seed);
  });

  it('always picks an unlocked area, in AREAS order', () => {
    const unlocked = ['verdantMeadow', 'shadowForest'];
    for (const date of ['2026-01-01', '2026-02-14', '2026-11-16', '2027-06-30']) {
      const { areaId } = dailyExpedition(date, unlocked);
      expect(unlocked).toContain(areaId);
      // Sorted pool is [verdantMeadow, shadowForest].
      expect(['verdantMeadow', 'shadowForest']).toContain(areaId);
    }
  });

  it('falls back to the first area when the unlocked list is empty', () => {
    expect(dailyExpedition('2026-11-16', [])).toEqual({
      areaId: ALL_AREAS[0],
      seed: fnv1a32('2026-11-16'),
    });
  });
});
