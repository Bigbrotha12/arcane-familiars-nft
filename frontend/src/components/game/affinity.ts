// Affinity presentation helpers shared by the battle HUD and the encounter
// overlays. Colours come from the DESIGN.md palette; matchup maths lives in
// @arcane-familiars/game-logic (single source of truth with combat).

import { Affinity, FAMILIARS, affinityEffectiveness } from '@arcane-familiars/game-logic';

export type Matchup = 'strong' | 'weak' | 'neutral';

/** DESIGN.md palette colour per affinity. */
export const AFFINITY_COLORS: Record<string, string> = {
  Fire: '#F59E0B',
  Water: '#2DD4BF',
  Earth: '#10B981',
  Wind: '#A5A3C4',
  Light: '#FBBF24',
  Dark: '#7C5CFC',
};

export function affinityColor(name: string | undefined): string {
  if (!name) return '#A5A3C4';
  return AFFINITY_COLORS[name] ?? '#A5A3C4';
}

/** Species id -> affinity (undefined when the id is unknown to the codex). */
export function affinityOf(familiarId: string | undefined): Affinity | undefined {
  if (!familiarId) return undefined;
  return FAMILIARS[familiarId as keyof typeof FAMILIARS]?.affinity;
}

/** Attacker's species vs defender's species, from the attacker's point of view. */
export function matchupFor(attackerId: string | undefined, defenderId: string | undefined): Matchup {
  const attacker = affinityOf(attackerId);
  const defender = affinityOf(defenderId);
  if (attacker === undefined || defender === undefined) return 'neutral';
  return affinityEffectiveness(attacker, defender);
}
