import { describe, it, expect } from 'vitest';
import { BALANCE } from '@/data/balance';
import { FAMILIARS, getFamiliar } from '@/data/familiars';
import { abilitiesAtLevel, learnSchedule, newlyLearned } from '../learnset';

const species = (id: string) => getFamiliar(id)!;

describe('abilitiesAtLevel', () => {
  it('gates a starter through the documented learn levels', () => {
    const dog = species('whiteDog'); // brave, sturdy, Light signature

    expect(abilitiesAtLevel(dog, 1)).toEqual(['brave']);
    expect(abilitiesAtLevel(dog, 2)).toEqual(['brave']);
    expect(abilitiesAtLevel(dog, 3)).toEqual(['brave', 'sturdy']);
    expect(abilitiesAtLevel(dog, 6)).toEqual(['brave', 'sturdy']);
    expect(abilitiesAtLevel(dog, 9)).toEqual(['brave', 'sturdy', 'sunburst']);
    expect(abilitiesAtLevel(dog, 12)).toEqual(['brave_2', 'sturdy_2', 'sunburst_2']);
    expect(abilitiesAtLevel(dog, 20)).toEqual(['brave_2', 'sturdy_2', 'sunburst_2']);
  });

  it('gives casters a real damaging move before their signature', () => {
    const aqua = species('aquaSprite');
    expect(abilitiesAtLevel(aqua, 1)).toEqual(['waterJet']);
    expect(abilitiesAtLevel(aqua, 3)).toEqual(['waterJet', 'healpulse']);
    expect(abilitiesAtLevel(aqua, 6)).toEqual(['waterJet', 'healpulse', 'sturdy']);
    expect(abilitiesAtLevel(aqua, 9)).toEqual(['waterJet', 'healpulse', 'sturdy', 'tidalCrash']);
    expect(abilitiesAtLevel(aqua, 12)).toEqual(['waterJet_2', 'healpulse_2', 'sturdy_2', 'tidalCrash_2']);

    const petal = species('petalWisp');
    expect(abilitiesAtLevel(petal, 1)).toEqual(['petalFlurry']);
    expect(abilitiesAtLevel(petal, 3)).toEqual(['petalFlurry', 'healpulse']);
    expect(abilitiesAtLevel(petal, 6)).toEqual(['petalFlurry', 'healpulse', 'purify', 'focus']);
    expect(abilitiesAtLevel(petal, 9)).toEqual(['petalFlurry', 'healpulse', 'purify', 'focus', 'sunburst']);
  });

  it('handles species with one, two, three and four base abilities', () => {
    const one = species('yellowFighter'); // brave
    expect(abilitiesAtLevel(one, 1)).toEqual(['brave']);
    expect(abilitiesAtLevel(one, 11)).toEqual(['brave', 'inferno']);
    expect(abilitiesAtLevel(one, 12)).toEqual(['brave_2', 'inferno_2']);

    const two = species('frostHare'); // quickstep, frostbite
    expect(abilitiesAtLevel(two, 1)).toEqual(['quickstep']);
    expect(abilitiesAtLevel(two, 3)).toEqual(['quickstep', 'frostbite']);
    expect(abilitiesAtLevel(two, 12)).toEqual(['quickstep_2', 'frostbite_2', 'tidalCrash_2']);

    const three = species('emberFox'); // fireball, flameLash, cinderCloak
    expect(abilitiesAtLevel(three, 5)).toEqual(['fireball', 'flameLash']);
    expect(abilitiesAtLevel(three, 6)).toEqual(['fireball', 'flameLash', 'cinderCloak']);
    expect(abilitiesAtLevel(three, 9)).toEqual(['fireball', 'flameLash', 'cinderCloak', 'inferno']);
  });

  it('treats any extra base entries as Lv 6 unlocks (non-boss fixture)', () => {
    const fourSlots = { ...species('honeyBear'), id: 'fixture', abilities: ['brave', 'sturdy', 'rally', 'ironbash'] };
    expect(abilitiesAtLevel(fourSlots, 3)).toEqual(['brave', 'sturdy']);
    expect(abilitiesAtLevel(fourSlots, 6)).toEqual(['brave', 'sturdy', 'rally', 'ironbash']);
  });

  it('does not duplicate a signature that is already in the species list', () => {
    const already = { ...species('whiteDog'), id: 'fixture', abilities: ['brave', 'sturdy', 'sunburst'] };
    expect(abilitiesAtLevel(already, 9)).toEqual(['brave', 'sturdy', 'sunburst']);
    expect(abilitiesAtLevel(already, 12)).toEqual(['brave_2', 'sturdy_2', 'sunburst_2']);
  });

  it('gives bosses their full authored kit, ranked up from the rank-up level', () => {
    for (const boss of Object.values(FAMILIARS).filter((f) => f.isBoss)) {
      for (const level of [1, 3, 6, 9, 11]) {
        expect(abilitiesAtLevel(boss, level), `${boss.id} @ ${level}`).toEqual(boss.abilities);
      }
      for (const level of [12, 20]) {
        expect(abilitiesAtLevel(boss, level), `${boss.id} @ ${level}`).toEqual(boss.abilities.map((id) => `${id}_2`));
      }
    }
    const keeper = species('archiveKeeper');
    expect(abilitiesAtLevel(keeper, 18)).toEqual(['hex_2', 'runeShield_2', 'nightTerror_2', 'siphon_2']);
  });
});

describe('learnSchedule', () => {
  it('lists every unlock in order, rank-ups last', () => {
    expect(learnSchedule(species('whiteDog'))).toEqual([
      { level: 1, abilityId: 'brave' },
      { level: 3, abilityId: 'sturdy' },
      { level: 9, abilityId: 'sunburst' },
      { level: 12, abilityId: 'brave_2' },
      { level: 12, abilityId: 'sturdy_2' },
      { level: 12, abilityId: 'sunburst_2' },
    ]);
  });

  it('uses the configured learn levels', () => {
    const schedule = learnSchedule(species('yellowFighter'));
    expect(schedule).toEqual([
      { level: 1, abilityId: 'brave' },
      { level: BALANCE.learnLevels.signature, abilityId: 'inferno' },
      { level: BALANCE.learnLevels.rankUp, abilityId: 'brave_2' },
      { level: BALANCE.learnLevels.rankUp, abilityId: 'inferno_2' },
    ]);
  });

  it('shows a boss kit as fully available from Lv 1', () => {
    expect(learnSchedule(species('meadowGuardian'))).toEqual([
      { level: 1, abilityId: 'brave' },
      { level: 1, abilityId: 'sturdy' },
      { level: 1, abilityId: 'naturabless' },
    ]);
  });
});

describe('newlyLearned', () => {
  it('returns only the ids added between two levels, in learned order', () => {
    const dog = species('whiteDog');
    expect(newlyLearned(dog, 1, 3)).toEqual(['sturdy']);
    expect(newlyLearned(dog, 6, 9)).toEqual(['sunburst']);
    expect(newlyLearned(dog, 11, 12)).toEqual(['brave_2', 'sturdy_2', 'sunburst_2']);
    expect(newlyLearned(dog, 9, 11)).toEqual([]);
  });

  it('includes every unlock at the destination level in a multi-level gain', () => {
    // At Lv 12 the base ids have been replaced by their rank-II variants, so the
    // newly learned ids are the upgraded ones.
    expect(newlyLearned(species('yellowFighter'), 1, 12)).toEqual(['brave_2', 'inferno_2']);
    expect(newlyLearned(species('yellowFighter'), 1, 9)).toEqual(['inferno']);
  });

  it('reports no new abilities for bosses, only their rank-ups', () => {
    expect(newlyLearned(species('caveWarden'), 1, 11)).toEqual([]);
    expect(newlyLearned(species('caveWarden'), 11, 12)).toEqual(species('caveWarden').abilities.map((id) => `${id}_2`));
  });
});
