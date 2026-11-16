import { describe, expect, it } from 'vitest';
import {
  advanceGuidedBattle,
  finishGuidedBattle,
  guidedHint,
  hideGuidedHint,
  initialGuidedBattleState,
  observeGuidedBattle,
  skipGuidedBattle,
  type GuidedBattleInput,
} from './guidedBattle';

function input(overrides: Partial<GuidedBattleInput> = {}): GuidedBattleInput {
  return {
    active: true,
    battleId: 'battle-1',
    guided: true,
    turnCount: 0,
    phase: 'menu',
    usableAbilityCount: 2,
    ...overrides,
  };
}

function start(usableAbilityCount = 2) {
  return observeGuidedBattle(initialGuidedBattleState(), input({ usableAbilityCount }));
}

describe('guided first battle', () => {
  it('starts only for a guided battle first seen at turn 0', () => {
    const state = start();
    expect(guidedHint(state)).toMatchObject({ action: 'attack', title: 'Guide · 1/3' });

    const notGuided = observeGuidedBattle(initialGuidedBattleState(), input({ guided: false }));
    expect(guidedHint(notGuided)).toBeNull();
  });

  it('never starts on a resumed battle', () => {
    const resumed = observeGuidedBattle(initialGuidedBattleState(), input({ turnCount: 2 }));
    expect(guidedHint(resumed)).toBeNull();
  });

  it('advances on any action, not just the highlighted one', () => {
    const first = start();

    const second = observeGuidedBattle(first, input({ turnCount: 1, usableAbilityCount: 2 }));
    expect(guidedHint(second)).toMatchObject({ action: 'ability', title: 'Guide · 2/3' });

    const third = observeGuidedBattle(second, input({ turnCount: 2, usableAbilityCount: 2 }));
    expect(guidedHint(third)).toMatchObject({ action: 'defend', title: 'Guide · 3/3' });

    const done = observeGuidedBattle(third, input({ turnCount: 3, usableAbilityCount: 2 }));
    expect(guidedHint(done)).toBeNull();
    expect(done.finished).toContain('battle-1');
  });

  it('skips the Ability step when no ability is usable', () => {
    const first = start(0);
    expect(guidedHint(first)).toMatchObject({ action: 'attack', title: 'Guide · 1/3' });

    const second = advanceGuidedBattle(first, 0);
    expect(guidedHint(second)).toMatchObject({ action: 'defend', title: 'Guide · 3/3' });
  });

  it('skips the Ability step if the ability became unusable before that turn', () => {
    const first = start(1);
    const second = observeGuidedBattle(first, input({ turnCount: 1, usableAbilityCount: 0 }));
    expect(guidedHint(second)).toMatchObject({ action: 'defend' });
  });

  it('ends on skip', () => {
    const skipped = skipGuidedBattle(start());
    expect(guidedHint(skipped)).toBeNull();
    expect(skipped.finished).toContain('battle-1');
  });

  it('ends when the battle ends', () => {
    const outcome = observeGuidedBattle(start(), input({ turnCount: 1, phase: 'outcome' }));
    expect(guidedHint(outcome)).toBeNull();
    expect(outcome.finished).toContain('battle-1');

    const leftBattle = observeGuidedBattle(start(), input({ active: false, battleId: undefined }));
    expect(guidedHint(leftBattle)).toBeNull();
    expect(leftBattle.finished).toContain('battle-1');
  });

  it('never starts a guide for a battle first seen mid-fight', () => {
    const midFight = observeGuidedBattle(initialGuidedBattleState(), input({ turnCount: 4 }));
    // Even a later snapshot claiming turn 0 must not revive it.
    const later = observeGuidedBattle(midFight, input({ turnCount: 0 }));
    expect(guidedHint(later)).toBeNull();
  });

  it('hides the card on "Got it" but keeps the step and highlight', () => {
    const hidden = hideGuidedHint(start());
    expect(hidden.hintHidden).toBe(true);
    expect(guidedHint(hidden)).toMatchObject({ action: 'attack' });

    const advanced = advanceGuidedBattle(hidden, 2);
    expect(advanced.hintHidden).toBe(false);
  });

  it('is idempotent for the same snapshot', () => {
    const first = start();
    const again = observeGuidedBattle(first, input());
    expect(again).toEqual(first);
  });

  it('does not restart a finished battle', () => {
    const finished = finishGuidedBattle(start());
    const observed = observeGuidedBattle(finished, input());
    expect(guidedHint(observed)).toBeNull();
  });
});
