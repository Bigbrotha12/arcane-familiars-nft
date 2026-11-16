import { describe, it, expect } from 'vitest';
import { getFamiliar } from '../../data/familiars';
import { PASSIVES } from '../../data/passives';
import { newPassiveTiers, partyPassives, passiveCombos, passiveTier, passiveTierRoman } from '../passives';

describe('passiveTier', () => {
  it('is locked below Lv 5 and reaches I..IV at the configured levels', () => {
    expect(passiveTier(1)).toBe(0);
    expect(passiveTier(4)).toBe(0);
    expect(passiveTier(5)).toBe(1);
    expect(passiveTier(9)).toBe(1);
    expect(passiveTier(10)).toBe(2);
    expect(passiveTier(15)).toBe(3);
    expect(passiveTier(20)).toBe(4);
    expect(passiveTier(40)).toBe(4);
  });

  it('renders roman numerals', () => {
    expect(passiveTierRoman(1)).toBe('I');
    expect(passiveTierRoman(4)).toBe('IV');
  });
});

describe('partyPassives', () => {
  it('collects both party members and skips locked passives', () => {
    const passives = partyPassives([
      { familiarId: 'emberFox', level: 5 },
      { familiarId: 'inkSerpent', level: 1 },
    ]);
    expect(passives).toEqual([
      { id: 'kindling', tier: 1, value: PASSIVES.kindling.tiers[0], sourceFamiliarId: 'emberFox' },
    ]);
  });

  it('keeps the highest tier when both members share a passive (no stacking)', () => {
    const passives = partyPassives([
      { familiarId: 'whiteDog', level: 5 },
      { familiarId: 'whiteDog', level: 10 },
    ]);
    expect(passives).toHaveLength(1);
    expect(passives[0]).toMatchObject({ id: 'secondWind', tier: 2, value: PASSIVES.secondWind.tiers[1] });
  });

  it('gives a Lv 5 White Dog Second Wind I and a Lv 10 one Second Wind II', () => {
    expect(partyPassives([{ familiarId: 'whiteDog', level: 5 }])[0]).toMatchObject({
      id: 'secondWind',
      tier: 1,
    });
    expect(partyPassives([{ familiarId: 'whiteDog', level: 10 }])[0]).toMatchObject({
      id: 'secondWind',
      tier: 2,
    });
  });
});

describe('newPassiveTiers', () => {
  it('reports each tier gained', () => {
    const fox = getFamiliar('emberFox')!;
    expect(newPassiveTiers(fox, 4, 5)).toEqual([{ id: 'kindling', tier: 1 }]);
    expect(newPassiveTiers(fox, 9, 15)).toEqual([
      { id: 'kindling', tier: 2 },
      { id: 'kindling', tier: 3 },
    ]);
  });

  it('reports nothing without a tier change or without a passive', () => {
    const fox = getFamiliar('emberFox')!;
    expect(newPassiveTiers(fox, 15, 15)).toEqual([]);
    expect(newPassiveTiers(fox, 1, 4)).toEqual([]);
    expect(newPassiveTiers(getFamiliar('meadowGuardian')!, 1, 20)).toEqual([]);
  });
});

describe('passiveCombos', () => {
  it('names the partner ability a passive boosts', () => {
    const fox = getFamiliar('emberFox')!;
    const serpent = getFamiliar('inkSerpent')!;
    const combos = passiveCombos(fox, 5, serpent, 9);
    expect(combos).toContain("Kindling boosts Ink Serpent's Hex");
  });

  it('treats rank-II abilities as their base id', () => {
    const fox = getFamiliar('emberFox')!;
    const serpent = getFamiliar('inkSerpent')!;
    expect(passiveCombos(fox, 5, serpent, 12)).toContain("Kindling boosts Ink Serpent's Hex");
  });

  it('only counts unlocked passives and never self-combos', () => {
    const fox = getFamiliar('emberFox')!;
    const serpent = getFamiliar('inkSerpent')!;
    expect(passiveCombos(fox, 4, serpent, 9).some((combo) => combo.startsWith('Kindling'))).toBe(false);

    const dog = getFamiliar('whiteDog')!;
    const fighter = getFamiliar('yellowFighter')!;
    const dogCombos = passiveCombos(dog, 5, fighter, 1);
    expect(dogCombos).toContain("Second Wind boosts Yellow Fighter's Brave");
    expect(dogCombos).not.toContain("Second Wind boosts White Dog's Brave");
  });
});
