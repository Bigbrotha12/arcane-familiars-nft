import type { CurioData, CurioOutcome } from '@/data/curios';
import { weightedRandom } from '@/utils/mathUtils';

export interface CurioResolution {
  outcome: CurioOutcome;
  text: string;
}

/**
 * Pick one of an option's weighted outcomes with the given RNG. Returns null
 * when the option does not exist on the curio, so callers can reject bad input
 * before mutating any run state.
 */
export function resolveCurioOption(curio: CurioData, optionId: string, rng: () => number): CurioResolution | null {
  const option = curio.options.find((entry) => entry.id === optionId);
  if (!option || option.outcomes.length === 0) return null;

  const { outcome, text } = option.outcomes[weightedRandom(rng, option.outcomes)];
  return { outcome, text };
}
