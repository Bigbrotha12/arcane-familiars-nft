import { BALANCE } from '@/data/balance';
import { getFamiliar, Rarity } from '@/data/familiars';
import type { GameState } from '@/types/gameState';

export interface RecruitOutcome {
  recruited: boolean;
  /** Bond after counting this win (0 when the win cannot build bond). */
  bond: number;
  /** Bond needed to guarantee a recruit for this species' rarity. */
  needed: number;
}

/** Per-win recruit chance for a defeated unowned species. */
export function recruitChance(rarity: Rarity): number {
  return rarity >= Rarity.Rare ? BALANCE.recruitChanceRare : BALANCE.recruitChanceCommon;
}

/**
 * Apply one non-boss win against `speciesId`.
 *
 * A win builds bond toward a guaranteed recruit, and can also recruit early on
 * a lucky roll. Unknown species, bosses, and already-owned species are no-ops
 * (they leave bond untouched). On recruit the species joins `playerFamiliars`
 * and its bond entry is cleared; the route owns the join level.
 */
export function applyRecruitWin(state: GameState, speciesId: string, roll: number): RecruitOutcome {
  const species = getFamiliar(speciesId);
  if (!species || species.isBoss || state.playerFamiliars.includes(speciesId)) {
    return { recruited: false, bond: 0, needed: 0 };
  }

  state.recruitBond ??= {};
  const bond = (state.recruitBond[speciesId] ?? 0) + 1;
  state.recruitBond[speciesId] = bond;
  const needed = BALANCE.recruitBondNeeded[species.rarity] ?? BALANCE.recruitBondNeeded[Rarity.Common];

  const recruited = roll < recruitChance(species.rarity) || bond >= needed;
  if (recruited) {
    state.playerFamiliars.push(speciesId);
    delete state.recruitBond[speciesId];
  }

  return { recruited, bond, needed };
}
