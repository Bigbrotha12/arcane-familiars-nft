import { describe, it, expect } from 'vitest';
import { BALANCE } from '../../data/balance';
import { Rarity } from '../../data/familiars';
import type { GameState } from '../../types/gameState';
import { applyRecruitWin, recruitChance } from '../recruit';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    id: 'state-test',
    anonymousId: 'anon-test',
    playerFamiliars: ['whiteDog', 'yellowFighter'],
    activeParty: ['whiteDog', 'yellowFighter'],
    inventory: { currency: 0, items: [] },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
    ...overrides,
  };
}

describe('applyRecruitWin', () => {
  it('guarantees a recruit once the bond threshold is reached', () => {
    const state = makeState({ recruitBond: { aquaSprite: 2 } });

    const result = applyRecruitWin(state, 'aquaSprite', 0.99);

    expect(result).toEqual({ recruited: true, bond: 3, needed: 3 });
    expect(state.playerFamiliars).toContain('aquaSprite');
    expect(state.recruitBond?.aquaSprite).toBeUndefined();
  });

  it('recruits early on a lucky roll', () => {
    const state = makeState();

    const result = applyRecruitWin(state, 'aquaSprite', 0);

    expect(result.recruited).toBe(true);
    expect(state.playerFamiliars).toContain('aquaSprite');
    expect(state.recruitBond?.aquaSprite).toBeUndefined();
  });

  it('builds bond and reports progress when the roll misses', () => {
    const state = makeState();

    const result = applyRecruitWin(state, 'aquaSprite', 0.99);

    expect(result).toEqual({ recruited: false, bond: 1, needed: 3 });
    expect(state.recruitBond?.aquaSprite).toBe(1);
  });

  it('skips already-owned species without touching bond', () => {
    const state = makeState({ playerFamiliars: ['whiteDog', 'yellowFighter', 'aquaSprite'] });

    const result = applyRecruitWin(state, 'aquaSprite', 0);

    expect(result).toEqual({ recruited: false, bond: 0, needed: 0 });
    expect(state.recruitBond).toBeUndefined();
  });

  it('skips bosses', () => {
    const state = makeState();

    const result = applyRecruitWin(state, 'shadowLord', 0);

    expect(result).toEqual({ recruited: false, bond: 0, needed: 0 });
    expect(state.playerFamiliars).not.toContain('shadowLord');
    expect(state.recruitBond).toBeUndefined();
  });

  it('skips unknown species', () => {
    const state = makeState();

    const result = applyRecruitWin(state, 'notAFamiliar', 0);

    expect(result).toEqual({ recruited: false, bond: 0, needed: 0 });
    expect(state.recruitBond).toBeUndefined();
  });

  it('loads an old save without a recruitBond field', () => {
    const state = makeState();
    expect(state.recruitBond).toBeUndefined();

    applyRecruitWin(state, 'aquaSprite', 0.99);

    expect(state.recruitBond).toEqual({ aquaSprite: 1 });
  });

  it('uses the rarity-specific bond requirement', () => {
    const state = makeState({ recruitBond: { thornWolf: 2 } });

    const result = applyRecruitWin(state, 'thornWolf', 0.99);

    expect(result).toEqual({ recruited: false, bond: 3, needed: 4 });
    expect(state.playerFamiliars).not.toContain('thornWolf');
  });

  it('uses the rare per-win chance for Rare and above', () => {
    expect(recruitChance(Rarity.Common)).toBe(BALANCE.recruitChanceCommon);
    expect(recruitChance(Rarity.Rare)).toBe(BALANCE.recruitChanceRare);
  });
});
