import { describe, it, expect } from 'vitest';
import { Affinity } from './familiars';
import { BALANCE, affinityEffectiveness, affinityMultiplier, battleXp, type AffinityEffectiveness } from './balance';

const AFFINITIES = [Affinity.Light, Affinity.Dark, Affinity.Fire, Affinity.Water, Affinity.Earth, Affinity.Wind];

// Independent statement of the designed chart, used to cross-check the
// implementation for every one of the 6 x 6 pairs.
const STRONG: Array<[Affinity, Affinity]> = [
  [Affinity.Fire, Affinity.Earth],
  [Affinity.Earth, Affinity.Wind],
  [Affinity.Wind, Affinity.Water],
  [Affinity.Water, Affinity.Fire],
  [Affinity.Light, Affinity.Dark],
  [Affinity.Dark, Affinity.Light],
];

function expectedEffectiveness(attacker: Affinity, defender: Affinity): AffinityEffectiveness {
  if (attacker === defender) return 'neutral';
  if (STRONG.some(([a, d]) => a === attacker && d === defender)) return 'strong';
  if (STRONG.some(([a, d]) => a === defender && d === attacker)) return 'weak';
  return 'neutral';
}

describe('affinity chart', () => {
  it('covers all 36 attacker/defender pairs', () => {
    for (const attacker of AFFINITIES) {
      for (const defender of AFFINITIES) {
        expect(affinityEffectiveness(attacker, defender), `${Affinity[attacker]} → ${Affinity[defender]}`).toBe(
          expectedEffectiveness(attacker, defender)
        );
      }
    }
  });

  it('maps the element cycle Fire > Earth > Wind > Water > Fire', () => {
    expect(affinityEffectiveness(Affinity.Fire, Affinity.Earth)).toBe('strong');
    expect(affinityEffectiveness(Affinity.Earth, Affinity.Wind)).toBe('strong');
    expect(affinityEffectiveness(Affinity.Wind, Affinity.Water)).toBe('strong');
    expect(affinityEffectiveness(Affinity.Water, Affinity.Fire)).toBe('strong');
    // ...and the reverse pairings are weak.
    expect(affinityEffectiveness(Affinity.Earth, Affinity.Fire)).toBe('weak');
    expect(affinityEffectiveness(Affinity.Wind, Affinity.Earth)).toBe('weak');
    expect(affinityEffectiveness(Affinity.Water, Affinity.Wind)).toBe('weak');
    expect(affinityEffectiveness(Affinity.Fire, Affinity.Water)).toBe('weak');
  });

  it('makes Light and Dark strong against each other', () => {
    expect(affinityEffectiveness(Affinity.Light, Affinity.Dark)).toBe('strong');
    expect(affinityEffectiveness(Affinity.Dark, Affinity.Light)).toBe('strong');
    expect(affinityEffectiveness(Affinity.Light, Affinity.Light)).toBe('neutral');
    expect(affinityEffectiveness(Affinity.Dark, Affinity.Dark)).toBe('neutral');
  });

  it('treats every other pairing as neutral', () => {
    expect(affinityEffectiveness(Affinity.Fire, Affinity.Light)).toBe('neutral');
    expect(affinityEffectiveness(Affinity.Water, Affinity.Earth)).toBe('neutral');
    expect(affinityEffectiveness(Affinity.Wind, Affinity.Dark)).toBe('neutral');
  });

  it('translates effectiveness into the balance multipliers', () => {
    expect(affinityMultiplier(Affinity.Fire, Affinity.Earth)).toBe(BALANCE.affinityStrong);
    expect(affinityMultiplier(Affinity.Fire, Affinity.Water)).toBe(BALANCE.affinityWeak);
    expect(affinityMultiplier(Affinity.Fire, Affinity.Wind)).toBe(1);
    expect(affinityMultiplier(Affinity.Wind, Affinity.Wind)).toBe(1);
  });
});

describe('battleXp', () => {
  it('scales with enemy level for normal encounters', () => {
    expect(battleXp(1, false)).toBe(BALANCE.xpBase + BALANCE.xpPerEnemyLevel);
    expect(battleXp(5, false)).toBe(BALANCE.xpBase + BALANCE.xpPerEnemyLevel * 5);
    expect(battleXp(10, false)).toBeGreaterThan(battleXp(5, false));
  });

  it('applies the boss multiplier and rounds', () => {
    const level = 3;
    const base = BALANCE.xpBase + BALANCE.xpPerEnemyLevel * level;
    expect(battleXp(level, true)).toBe(Math.round(base * BALANCE.bossXpMultiplier));
    expect(battleXp(level, true)).toBeGreaterThan(battleXp(level, false));
  });
});
