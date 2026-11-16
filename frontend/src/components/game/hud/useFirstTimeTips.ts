// First-time contextual tips. Derives one-time triggers from the game
// snapshot, keeps them in a table-ordered queue, and shows a single card at a
// time. The pure trigger/queue logic lives in tipRules.ts so it can be tested
// without React or a browser.
//
// A tip shows only while its situation is happening. Tips about a centered
// overlay (encounter, treasure, curio, outcome) show alongside it in a top
// corner; every other tip waits until no overlay is open.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameStateSnapshot } from '@/game';
import {
  detectTips,
  getTip,
  isOverlayActive,
  mergeTipQueue,
  OVERLAY_TIPS,
  nextTip,
  type TipDefinition,
  type TipId,
} from './tipRules';
import { currentTipsPlayerId, readSeenTips, readTipsEnabled, writeSeenTips, writeTipsEnabled } from './tipStorage';

interface TipsState {
  current: TipId | null;
  queue: TipId[];
}

export interface FirstTimeTips {
  enabled: boolean;
  currentTip: TipDefinition | null;
  visible: boolean;
  dismiss: () => void;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
}

export function useFirstTimeTips(snapshot: GameStateSnapshot | null): FirstTimeTips {
  const [enabled, setEnabledState] = useState<boolean>(readTipsEnabled);
  const [state, setState] = useState<TipsState>({ current: null, queue: [] });
  const seenRef = useRef<Set<TipId>>(new Set());
  const playerIdRef = useRef<string | null>(null);

  // Load the per-player seen list when the snapshot first arrives, then keep
  // queueing newly triggered tips. Detection runs even while tips are off so
  // turning them back on can resume unseen ones.
  useEffect(() => {
    if (!snapshot) return;

    const playerId = currentTipsPlayerId();
    let seen = seenRef.current;
    if (playerIdRef.current !== playerId) {
      playerIdRef.current = playerId;
      seen = readSeenTips(playerId);
      seenRef.current = seen;
      setState({ current: null, queue: [] });
    }

    const detected = detectTips(snapshot);
    if (detected.length === 0) return;

    setState((previous) => {
      const queue = mergeTipQueue(previous.queue, detected, seen, previous.current);
      if (queue === previous.queue) return previous;
      return { ...previous, queue };
    });
  }, [snapshot]);

  // Mark a tip as seen as soon as it is displayed, so dismissing a battle or
  // reloading can never show the same card twice.
  useEffect(() => {
    const current = state.current;
    if (!current || seenRef.current.has(current)) return;
    seenRef.current.add(current);
    writeSeenTips(playerIdRef.current ?? currentTipsPlayerId(), seenRef.current);
  }, [state.current]);

  const blocked = snapshot ? isOverlayActive(snapshot) : false;
  const active = snapshot ? detectTips(snapshot) : [];
  const activeKey = active.join(',');

  // Promote the first queued tip whose situation is happening now. The
  // functional update keeps StrictMode's double effect invocation from
  // dropping a queued tip or showing two cards.
  useEffect(() => {
    if (!enabled) return;
    const now = activeKey ? (activeKey.split(',') as TipId[]) : [];
    setState((previous) => {
      if (previous.current) return previous;
      const next = nextTip(previous.queue, blocked, now);
      if (!next) return previous;
      return { current: next, queue: previous.queue.filter((id) => id !== next) };
    });
  }, [enabled, blocked, activeKey, state.current, state.queue]);

  // An overlay tip closes with its overlay (it is already marked seen).
  useEffect(() => {
    const current = state.current;
    if (!current || !OVERLAY_TIPS.has(current)) return;
    const now = activeKey ? activeKey.split(',') : [];
    if (!now.includes(current)) {
      setState((previous) => (previous.current === current ? { ...previous, current: null } : previous));
    }
  }, [activeKey, state.current]);

  const dismiss = useCallback(() => {
    setState((previous) => (previous.current ? { ...previous, current: null } : previous));
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    writeTipsEnabled(value);
    setEnabledState(value);
    if (!value) {
      setState((previous) => (previous.current ? { ...previous, current: null } : previous));
    }
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return {
    enabled,
    currentTip: state.current ? getTip(state.current) : null,
    visible: Boolean(enabled && snapshot && state.current && (!blocked || OVERLAY_TIPS.has(state.current))),
    dismiss,
    setEnabled,
    toggleEnabled,
  };
}
