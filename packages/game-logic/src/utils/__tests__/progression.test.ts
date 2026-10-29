import { describe, it, expect } from 'vitest';
import {
  MAX_FAMILIAR_LEVEL,
  applyFamiliarXp,
  familiarLevelMultiplier,
  scaleFamiliarStats,
  xpToNextLevel,
} from '../progression';
import { getFamiliar } from '../../data/familiars';

describe('familiar progression', () => {
  it('levels up when enough XP is awarded', () => {
    const result = applyFamiliarXp(1, 0, xpToNextLevel(1));
    expect(result.level).toBe(2);
    expect(result.xp).toBe(0);
    expect(result.leveledUp).toBe(true);
  });

  it('rolls over multiple levels', () => {
    const total = xpToNextLevel(1) + xpToNextLevel(2) + xpToNextLevel(3);
    const result = applyFamiliarXp(1, 0, total);
    expect(result.level).toBe(4);
    expect(result.levelsGained).toBe(3);
  });

  it('caps at the maximum level', () => {
    const result = applyFamiliarXp(MAX_FAMILIAR_LEVEL, 0, 10_000);
    expect(result.level).toBe(MAX_FAMILIAR_LEVEL);
    expect(result.xp).toBe(0);
  });

  it('does not change base stats at level 1', () => {
    const base = getFamiliar('whiteDog')!.stats;
    expect(familiarLevelMultiplier(1)).toBe(1);
    expect(scaleFamiliarStats(base, 1)).toEqual(base);
  });

  it('scales stats upward with level', () => {
    const base = getFamiliar('whiteDog')!.stats;
    const scaled = scaleFamiliarStats(base, 10);
    expect(scaled.hp).toBeGreaterThan(base.hp);
    expect(scaled.attack).toBeGreaterThan(base.attack);
  });
});
