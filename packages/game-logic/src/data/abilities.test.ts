import { describe, it, expect } from 'vitest';
import { ABILITIES, EffectType, SIGNATURE_BY_AFFINITY, getAbility } from './abilities';
import { Affinity } from './familiars';

const BASE_ABILITIES = Object.values(ABILITIES).filter((ability) => !ability.id.endsWith('_2'));

const round2 = (value: number) => Math.round(value * 100) / 100;

describe('rank-II ability variants', () => {
  it('generates a variant for every base ability', () => {
    expect(BASE_ABILITIES.length).toBeGreaterThan(0);
    for (const base of BASE_ABILITIES) {
      const variant = getAbility(`${base.id}_2`);
      expect(variant, `missing variant for ${base.id}`).toBeDefined();
      expect(variant!.name).toBe(`${base.name} II`);
      expect(variant!.mpCost).toBe(Math.round(base.mpCost * 0.8));
      expect(variant!.cooldown).toBe(base.cooldown);
      expect(variant!.description).toContain('Rank II');
    }
  });

  it('raises Damage and Heal multipliers by 20% (2 dp) and keeps the rest', () => {
    for (const base of BASE_ABILITIES) {
      const variant = getAbility(`${base.id}_2`)!;
      if (base.effectType === EffectType.Damage || base.effectType === EffectType.Heal) {
        expect(variant.multiplier, base.id).toBe(round2(base.multiplier * 1.2));
      } else {
        expect(variant.multiplier, base.id).toBe(base.multiplier);
      }
    }

    expect(getAbility('brave_2')!.multiplier).toBe(1.56);
    expect(getAbility('fireball_2')!.multiplier).toBe(2.4);
    expect(getAbility('healpulse_2')!.multiplier).toBe(0.36);
  });

  it('extends buff/debuff/dot statuses and scales dot/hot values by 1.3', () => {
    expect(getAbility('sturdy_2')!.statusEffect).toMatchObject({ duration: 3, value: 1.5 });
    expect(getAbility('hex_2')!.statusEffect).toMatchObject({ duration: 4, value: 13 });
    expect(getAbility('rootSnare_2')!.statusEffect).toMatchObject({ duration: 3, value: 0.65 });
  });

  it('keeps Brave low-HP scaling and updates the quoted numbers', () => {
    const braveII = getAbility('brave_2')!;
    expect(braveII.lowHpBonus).toBe(0.9);
    expect(braveII.description).toContain('1.56x');
    expect(braveII.description).toContain('2.46x');
  });
});

describe('early caster damage abilities', () => {
  it('defines Water Jet and Petal Flurry as cheap arcane damage', () => {
    for (const id of ['waterJet', 'petalFlurry']) {
      const ability = getAbility(id);
      expect(ability, id).toBeDefined();
      expect(ability!.effectType).toBe(EffectType.Damage);
      expect(ability!.mpCost).toBe(7);
      expect(ability!.cooldown).toBe(1);
      expect(ability!.multiplier).toBe(1.1);
      expect(ability!.description).toBe('Deal 1.1x arcane damage');
    }
    expect(getAbility('waterJet')!.name).toBe('Water Jet');
    expect(getAbility('petalFlurry')!.name).toBe('Petal Flurry');
  });

  it('generates rank-II variants with the usual damage bump', () => {
    for (const id of ['waterJet', 'petalFlurry']) {
      const variant = getAbility(`${id}_2`);
      expect(variant, `${id}_2`).toBeDefined();
      expect(variant!.multiplier).toBe(1.32);
      expect(variant!.description).toContain('1.32x');
      expect(variant!.description).toContain('Rank II');
    }
  });
});

describe('affinity signature abilities', () => {
  const EXPECTED: Record<Affinity, { id: string; name: string; mpCost: number; cooldown: number; multiplier: number }> =
    {
      [Affinity.Fire]: { id: 'inferno', name: 'Inferno', mpCost: 22, cooldown: 4, multiplier: 1.7 },
      [Affinity.Water]: { id: 'tidalCrash', name: 'Tidal Crash', mpCost: 20, cooldown: 4, multiplier: 1.7 },
      [Affinity.Earth]: { id: 'quake', name: 'Quake', mpCost: 20, cooldown: 4, multiplier: 1.7 },
      [Affinity.Wind]: { id: 'galeEdge', name: 'Gale Edge', mpCost: 18, cooldown: 3, multiplier: 1.9 },
      [Affinity.Light]: { id: 'sunburst', name: 'Sunburst', mpCost: 20, cooldown: 4, multiplier: 1.6 },
      [Affinity.Dark]: { id: 'soulRend', name: 'Soul Rend', mpCost: 22, cooldown: 4, multiplier: 1.4 },
    };

  it('maps every affinity to an existing ability with the named stats', () => {
    const affinities = [Affinity.Light, Affinity.Dark, Affinity.Fire, Affinity.Water, Affinity.Earth, Affinity.Wind];
    for (const affinity of affinities) {
      const expected = EXPECTED[affinity];
      expect(SIGNATURE_BY_AFFINITY[affinity]).toBe(expected.id);
      const ability = getAbility(expected.id);
      expect(ability).toBeDefined();
      expect(ability!.name).toBe(expected.name);
      expect(ability!.mpCost).toBe(expected.mpCost);
      expect(ability!.cooldown).toBe(expected.cooldown);
      expect(ability!.multiplier).toBe(expected.multiplier);
    }
  });

  it('applies the listed secondary effects', () => {
    expect(getAbility('inferno')!.statusEffect).toMatchObject({ type: EffectType.Dot, value: 8, duration: 3 });
    expect(getAbility('tidalCrash')!.statusEffect).toMatchObject({ type: EffectType.Debuff, value: 0.7, duration: 2 });
    expect(getAbility('quake')!.statusEffect).toMatchObject({ type: EffectType.Debuff, value: 0.75, duration: 2 });
    expect(getAbility('galeEdge')!.statusEffect).toBeUndefined();
    expect(getAbility('sunburst')!.statusEffect).toMatchObject({ type: EffectType.Debuff, value: 0.8, duration: 2 });
    expect(getAbility('soulRend')!.statusEffect).toMatchObject({ type: EffectType.Dot, value: 12, duration: 3 });
  });

  it('generates rank-II variants of signature abilities', () => {
    for (const id of Object.values(SIGNATURE_BY_AFFINITY)) {
      expect(getAbility(`${id}_2`), `missing ${id}_2`).toBeDefined();
    }
    expect(getAbility('inferno_2')!.multiplier).toBe(round2(1.7 * 1.2));
  });
});
