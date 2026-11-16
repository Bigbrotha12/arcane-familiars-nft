import { describe, it, expect } from 'vitest';
import { CURIOS } from './curios';
import { ITEMS } from './items';
import { AREAS } from './areas';

describe('curio catalog', () => {
  it('references only real items as option requirements', () => {
    for (const curio of Object.values(CURIOS)) {
      for (const option of curio.options) {
        if (!option.requiresItem) continue;
        expect(ITEMS[option.requiresItem], `${curio.id}/${option.id}`).toBeDefined();
      }
    }
  });

  it('gives every outcome a positive weight and a text', () => {
    for (const curio of Object.values(CURIOS)) {
      for (const option of curio.options) {
        expect(option.outcomes.length, `${curio.id}/${option.id}`).toBeGreaterThan(0);
        for (const entry of option.outcomes) {
          expect(entry.weight, `${curio.id}/${option.id}`).toBeGreaterThan(0);
          expect(entry.text.trim().length, `${curio.id}/${option.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('only lists real areas and covers all six', () => {
    const areaIds = Object.keys(AREAS);
    const covered = new Set<string>();

    for (const curio of Object.values(CURIOS)) {
      expect(curio.areas.length, curio.id).toBeGreaterThan(0);
      for (const areaId of curio.areas) {
        expect(areaIds, curio.id).toContain(areaId);
        covered.add(areaId);
      }
    }

    expect([...covered].sort()).toEqual(areaIds.sort());
  });

  it('gives every curio at least one option with a unique id', () => {
    for (const curio of Object.values(CURIOS)) {
      expect(curio.options.length, curio.id).toBeGreaterThan(0);
      const ids = curio.options.map((option) => option.id);
      expect(new Set(ids).size, curio.id).toBe(ids.length);
    }
  });
});
