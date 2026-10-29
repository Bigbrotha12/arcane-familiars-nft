import { describe, it, expect } from 'vitest';
import { AREAS } from './areas';
import { ABILITIES } from './abilities';
import { FAMILIARS } from './familiars';
import { ITEMS } from './items';

describe('content catalog', () => {
  it('ships six regions', () => {
    expect(Object.keys(AREAS)).toHaveLength(6);
  });

  it('ships 25 familiars', () => {
    expect(Object.keys(FAMILIARS)).toHaveLength(25);
  });

  it('ships 26 abilities', () => {
    expect(Object.keys(ABILITIES)).toHaveLength(26);
  });

  it('ships 20 items', () => {
    expect(Object.keys(ITEMS)).toHaveLength(20);
  });

  it('every region references real familiars, a real boss, and a real unlock', () => {
    const ids = Object.keys(FAMILIARS);
    const areas = Object.keys(AREAS);
    for (const area of Object.values(AREAS)) {
      for (const id of area.encounterPool) expect(ids).toContain(id);
      expect(ids).toContain(area.bossId);
      expect(ids).toContain(area.baseFamiliar);
      if (area.unlocks) expect(areas).toContain(area.unlocks);
    }
  });

  it('every familiar references real abilities', () => {
    const abilityIds = Object.keys(ABILITIES);
    for (const familiar of Object.values(FAMILIARS)) {
      expect(familiar.abilities.length).toBeGreaterThan(0);
      for (const id of familiar.abilities) expect(abilityIds).toContain(id);
    }
  });

  it('every item has at least one effect', () => {
    for (const item of Object.values(ITEMS)) {
      expect(item.effects.length).toBeGreaterThan(0);
    }
  });
});
