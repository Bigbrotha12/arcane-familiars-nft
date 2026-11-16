import { describe, it, expect } from 'vitest';
import { CURIOS } from '@/data/curios';
import type { CurioData } from '@/data/curios';
import { resolveCurioOption } from '../curios';
import { seededRandom } from '../mathUtils';

describe('resolveCurioOption', () => {
  it('is deterministic for the same curio, option and seed', () => {
    const a = resolveCurioOption(CURIOS.abandonedPack, 'search', seededRandom(123));
    const b = resolveCurioOption(CURIOS.abandonedPack, 'search', seededRandom(123));
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });

  it('returns one of the option outcomes with its text', () => {
    const curio = CURIOS.mossyShrine;
    const option = curio.options.find((entry) => entry.id === 'pray')!;
    const resolution = resolveCurioOption(curio, 'pray', seededRandom(7))!;

    expect(option.outcomes.some((entry) => entry.outcome === resolution.outcome)).toBe(true);
    expect(option.outcomes.some((entry) => entry.text === resolution.text)).toBe(true);
  });

  it('reaches every weighted outcome across seeds', () => {
    const curio: CurioData = {
      id: 'test',
      name: 'Test',
      description: '',
      areas: [],
      options: [
        {
          id: 'pick',
          label: 'Pick',
          outcomes: [
            { weight: 1, outcome: { kind: 'nothing' }, text: 'low' },
            { weight: 1, outcome: { kind: 'coins', min: 1, max: 1 }, text: 'high' },
          ],
        },
      ],
    };

    const seen = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const resolution = resolveCurioOption(curio, 'pick', seededRandom(seed));
      expect(resolution).not.toBeNull();
      seen.add(resolution!.text);
    }
    expect(seen).toEqual(new Set(['low', 'high']));
  });

  it('returns null for an unknown option', () => {
    expect(resolveCurioOption(CURIOS.mossyShrine, 'missing', seededRandom(1))).toBeNull();
  });
});
