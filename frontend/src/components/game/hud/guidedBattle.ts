// Pure guided-first-battle rules: when the three coached turns start, advance,
// and end. Kept free of React and storage so it can be unit-tested directly
// (see guidedBattle.test.ts). The guide never blocks input; it only tracks
// which ActionBar button to highlight and what the hint card says.

export type GuidedAction = 'attack' | 'ability' | 'defend';

/** Display order. The Ability step is skipped when no ability is usable. */
export const GUIDED_STEP_ORDER: readonly GuidedAction[] = ['attack', 'ability', 'defend'];

export const GUIDED_STEP_BODIES: Record<GuidedAction, string> = {
  attack: 'Attack deals damage and restores a little MP.',
  ability: 'Abilities cost MP and hit harder. Try one.',
  defend: "Defend halves the next hit. Use it when you're low or a big attack is coming.",
};

export interface GuidedBattleState {
  /** Battle the guide belongs to; null when no guide has started. */
  battleId: string | null;
  /** Step list for this battle (always the full 1/3..3/3 order). */
  steps: GuidedAction[];
  /** Index into `steps`. */
  index: number;
  /** Battle turn the current step was reached on. */
  turnCount: number;
  /** "Got it" was clicked for the current step; the highlight stays. */
  hintHidden: boolean;
  /** Battle ids finished or skipped this page session. */
  finished: string[];
  /** Turn count when each battle id was first seen this page session. */
  firstSeen: Record<string, number>;
}

export interface GuidedBattleInput {
  /** True while a battle scene is on screen. */
  active: boolean;
  battleId?: string;
  guided?: boolean;
  turnCount?: number;
  phase?: string;
  /** Abilities the player can use right now. */
  usableAbilityCount: number;
}

export interface GuidedHint {
  action: GuidedAction;
  title: string;
  body: string;
  stepNumber: number;
  stepCount: number;
}

export function initialGuidedBattleState(): GuidedBattleState {
  return {
    battleId: null,
    steps: [],
    index: 0,
    turnCount: 0,
    hintHidden: false,
    finished: [],
    firstSeen: {},
  };
}

/** The guide only starts for a battle first seen at turn 0 with guided set. */
function canStart(state: GuidedBattleState, battleId: string, input: GuidedBattleInput): boolean {
  if (state.finished.includes(battleId)) return false;
  if ((state.firstSeen[battleId] ?? 0) !== 0) return false;
  if (input.guided !== true) return false;
  return (input.turnCount ?? 0) === 0;
}

/**
 * Fold one snapshot into the guided state. Idempotent: observing the same
 * snapshot twice returns an equivalent state, so React's double-invoked
 * updaters cannot advance the guide twice.
 */
export function observeGuidedBattle(state: GuidedBattleState, input: GuidedBattleInput): GuidedBattleState {
  const battleId = input.battleId;
  if (!input.active || !battleId) {
    return state.steps.length > 0 ? finishGuidedBattle(state) : state;
  }

  const turnCount = input.turnCount ?? 0;

  let next = state;
  if (!(battleId in next.firstSeen)) {
    next = { ...next, firstSeen: { ...next.firstSeen, [battleId]: turnCount } };
  }

  if (next.steps.length > 0 && next.battleId !== battleId) {
    next = finishGuidedBattle(next);
  }

  if (next.steps.length > 0) {
    if (input.phase === 'outcome') return finishGuidedBattle(next);
    if (turnCount > next.turnCount) {
      return advanceGuidedBattle({ ...next, turnCount }, input.usableAbilityCount);
    }
    return next;
  }

  if (!canStart(next, battleId, input)) return next;

  // Numbering stays 1/3..3/3; the Ability step is skipped, not renumbered, when
  // no ability is usable ("otherwise skip to 3").
  return { ...next, battleId, steps: [...GUIDED_STEP_ORDER], index: 0, turnCount, hintHidden: false };
}

/**
 * Move to the next step. The Ability step is skipped when no ability is usable
 * at that moment; past the last step the guide ends.
 */
export function advanceGuidedBattle(state: GuidedBattleState, usableAbilityCount: number): GuidedBattleState {
  if (state.steps.length === 0) return state;

  let index = state.index + 1;
  if (state.steps[index] === 'ability' && usableAbilityCount === 0) index += 1;
  if (index >= state.steps.length) return finishGuidedBattle(state);

  return { ...state, index, hintHidden: false };
}

/** End the guide for this battle and remember it for the rest of the session. */
export function finishGuidedBattle(state: GuidedBattleState): GuidedBattleState {
  if (state.steps.length === 0) return state;
  const battleId = state.battleId;
  const finished = battleId && !state.finished.includes(battleId) ? [...state.finished, battleId] : state.finished;
  return { ...state, steps: [], index: 0, hintHidden: false, finished };
}

export function skipGuidedBattle(state: GuidedBattleState): GuidedBattleState {
  return finishGuidedBattle(state);
}

export function hideGuidedHint(state: GuidedBattleState): GuidedBattleState {
  return state.hintHidden ? state : { ...state, hintHidden: true };
}

/** Card contents for the current step, or null when the guide is not running. */
export function guidedHint(state: GuidedBattleState): GuidedHint | null {
  const action = state.steps[state.index];
  if (!action) return null;
  return {
    action,
    title: `Guide · ${state.index + 1}/${state.steps.length}`,
    body: GUIDED_STEP_BODIES[action],
    stepNumber: state.index + 1,
    stepCount: state.steps.length,
  };
}
