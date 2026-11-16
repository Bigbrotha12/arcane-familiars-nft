// Session-scoped guided first battle. The pure rules live in guidedBattle.ts;
// this hook only keeps the state and exposes the current step to the HUD.
//
// The guide is offered once per page session for a battle whose first snapshot
// was guided and at turn 0. A reload mid-battle therefore resumes without it.
// Nothing here gates input: buttons stay enabled and "Skip guide" is always one
// click away.

import { useCallback, useEffect, useState } from 'react';
import type { GameStateSnapshot } from '@/game';
import {
  guidedHint,
  hideGuidedHint,
  initialGuidedBattleState,
  observeGuidedBattle,
  skipGuidedBattle,
  type GuidedAction,
  type GuidedBattleState,
  type GuidedHint,
} from './guidedBattle';

export interface GuidedBattleController {
  /** True while the guide is running (also during the acting phase, so tips stay paused). */
  running: boolean;
  /** ActionBar button to highlight, only while choosing an action. */
  highlight: GuidedAction | null;
  /** Hint card contents; null when not choosing, on "Got it", or after the guide ends. */
  hint: GuidedHint | null;
  gotIt: () => void;
  skip: () => void;
}

export function useGuidedBattle(snapshot: GameStateSnapshot | null): GuidedBattleController {
  const [state, setState] = useState<GuidedBattleState>(initialGuidedBattleState);

  useEffect(() => {
    if (!snapshot) return;
    setState((previous) =>
      observeGuidedBattle(previous, {
        active: snapshot.currentScene === 'battle',
        battleId: snapshot.battleId,
        guided: snapshot.guided === true,
        turnCount: snapshot.turnCount ?? 0,
        phase: snapshot.phase,
        usableAbilityCount: (snapshot.abilities ?? []).filter((ability) => ability.usable).length,
      })
    );
  }, [snapshot]);

  const gotIt = useCallback(() => {
    setState((previous) => hideGuidedHint(previous));
  }, []);

  const skip = useCallback(() => {
    setState((previous) => skipGuidedBattle(previous));
  }, []);

  const running =
    snapshot?.currentScene === 'battle' &&
    state.battleId !== null &&
    state.battleId === snapshot.battleId &&
    state.steps.length > 0;
  const choosing = running && snapshot?.phase === 'menu';

  return {
    running,
    highlight: choosing ? (state.steps[state.index] ?? null) : null,
    hint: choosing && !state.hintHidden ? guidedHint(state) : null,
    gotIt,
    skip,
  };
}
