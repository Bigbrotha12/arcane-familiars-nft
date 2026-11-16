import { gameEventBus } from '../event-bus';
import { GameEvent, type BattleSpeed, type BattleSpeedPayload } from '../events';
import { MOTION } from '../ui/motion';

/**
 * Battle playback speed, chosen in the game toolbar and kept in localStorage.
 *
 * Only the beats between turn steps are scaled; the hit animations themselves
 * keep DESIGN.md's motion timings. `fast` is the original pacing.
 */
export const BATTLE_SPEED_STORAGE_KEY = 'af_battle_speed';
export const DEFAULT_BATTLE_SPEED: BattleSpeed = 'medium';

const STEP_DELAY_MS: Record<BattleSpeed, number> = {
  slow: 1700,
  medium: 1100,
  fast: MOTION.stepDelay,
};

const OUTCOME_DELAY_MS: Record<BattleSpeed, number> = {
  slow: 1300,
  medium: 950,
  fast: MOTION.outcomeDelay,
};

export function isBattleSpeed(value: unknown): value is BattleSpeed {
  return value === 'slow' || value === 'medium' || value === 'fast';
}

function readStoredSpeed(): BattleSpeed {
  try {
    const stored = localStorage.getItem(BATTLE_SPEED_STORAGE_KEY);
    return isBattleSpeed(stored) ? stored : DEFAULT_BATTLE_SPEED;
  } catch {
    return DEFAULT_BATTLE_SPEED;
  }
}

let current: BattleSpeed = readStoredSpeed();

gameEventBus.on(GameEvent.SET_BATTLE_SPEED, (payload: BattleSpeedPayload) => {
  if (!isBattleSpeed(payload?.speed)) return;
  current = payload.speed;
  try {
    localStorage.setItem(BATTLE_SPEED_STORAGE_KEY, current);
  } catch {
    // Storage can be unavailable in private/embedded contexts; the in-memory
    // value still applies for this session.
  }
});

export function getBattleSpeed(): BattleSpeed {
  return current;
}

export function battleStepDelay(): number {
  return STEP_DELAY_MS[current];
}

export function battleOutcomeDelay(): number {
  return OUTCOME_DELAY_MS[current];
}
