// Shared bestiary block for encounter overlays: enemy portrait, name, level,
// affinity chip, and the lead/bench affinity matchup lines. Presentational;
// receives the pending-encounter snapshot emitted by the exploration scene.

import { useState } from 'react';
import { Affinity, BALANCE, FAMILIARS, affinityEffectiveness } from '@arcane-familiars/game-logic';
import { portraitPath } from '@/components/collection/entries';
import type { EncounterSnapshot, FamiliarState } from '@/game';

/** Affinity chip colors drawn from the DESIGN.md palette. */
const AFFINITY_COLORS: Record<string, string> = {
  Fire: '#F59E0B',
  Water: '#2DD4BF',
  Earth: '#10B981',
  Wind: '#A5A3C4',
  Light: '#FBBF24',
  Dark: '#7C5CFC',
};

interface EncounterDetailsProps {
  encounter: EncounterSnapshot;
  party?: FamiliarState[];
  activeId?: string;
  /** Per-species recruit bond from the game state. */
  recruitBond?: Record<string, number>;
  /** Species ids the player already owns. */
  ownedFamiliars?: string[];
}

/** `whiteDog` -> `White Dog` (fallback when a species has no metadata). */
function humanizeId(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function matchupLine(familiar: FamiliarState, enemyAffinity: Affinity): string {
  const data = FAMILIARS[familiar.id];
  if (!data) return `${familiar.name} — even match`;

  const element = Affinity[enemyAffinity];
  switch (affinityEffectiveness(data.affinity, enemyAffinity)) {
    case 'strong':
      return `${data.name} — strong against ${element}`;
    case 'weak':
      return `${data.name} — weak against ${element}`;
    default:
      return `${data.name} — even match`;
  }
}

function EncounterDetails({ encounter, party = [], activeId, recruitBond, ownedFamiliars }: EncounterDetailsProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const enemy = FAMILIARS[encounter.enemyId];
  const name = enemy?.name ?? humanizeId(encounter.enemyId);
  const affinity = enemy ? Affinity[enemy.affinity] : undefined;
  const affinityColor = affinity ? (AFFINITY_COLORS[affinity] ?? '#A5A3C4') : undefined;

  const showRecruit =
    Boolean(enemy) && !encounter.isBoss && ownedFamiliars !== undefined && !ownedFamiliars.includes(encounter.enemyId);
  const bond = recruitBond?.[encounter.enemyId] ?? 0;
  const needed = enemy ? (BALANCE.recruitBondNeeded[enemy.rarity] ?? 0) : 0;

  const lead = party.find((f) => f.id === activeId) ?? party[0];
  const bench = party.find((f) => f.id !== lead?.id);
  const matchups = enemy
    ? [lead, bench].filter((f): f is FamiliarState => Boolean(f)).map((f) => matchupLine(f, enemy.affinity))
    : [];

  return (
    <div className="flex flex-col gap-md max-sm:gap-lg">
      <div className="flex items-center gap-md max-sm:gap-lg">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#3B3870] bg-gradient-to-br from-[#2D2A5E] to-[#1E1B4B] max-sm:h-32 max-sm:w-32">
          {!imageFailed ? (
            <img
              src={portraitPath(encounter.enemyId)}
              alt={name}
              className="h-full w-full object-contain"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="select-none font-display text-3xl font-semibold text-[#7C5CFC]/60" aria-hidden="true">
              {name.charAt(0)}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-display text-lg font-semibold text-[#F0EFFF] max-sm:text-[26px]">{name}</h3>
            {encounter.isBoss && (
              <span className="shrink-0 rounded-full border border-error/60 bg-error/20 px-1.5 py-px font-display text-[9px] font-semibold uppercase tracking-wider text-error max-sm:px-2 max-sm:text-[15px]">
                Boss
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs tabular-nums text-[#B8B5E0] max-sm:text-[20px]">
              Lv {encounter.level}
            </span>
            {affinity && affinityColor && (
              <span
                className="rounded-full border px-1.5 py-px font-body text-[10px] font-medium max-sm:px-2.5 max-sm:text-[17px]"
                style={{
                  color: affinityColor,
                  borderColor: `${affinityColor}66`,
                  backgroundColor: `${affinityColor}22`,
                }}
              >
                {affinity}
              </span>
            )}
          </div>
          {showRecruit && (
            <p className="font-mono text-[11px] tabular-nums text-pink max-sm:text-[18px]">
              Recruitable · Bond {bond}/{needed}
            </p>
          )}
        </div>
      </div>

      {matchups.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-t border-[#3B3870] pt-sm">
          {matchups.map((line) => (
            <li key={line} className="font-body text-xs text-[#B8B5E0] max-sm:text-[20px]">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EncounterDetails;
