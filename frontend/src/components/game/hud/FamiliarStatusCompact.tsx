// Compact combatant card: name + level, affinity chip, HP/MP bars, status
// effect icons. Solid background with double-lined border; same layout for both
// sides. The enemy panel additionally carries the matchup indicator (from the
// active familiar's point of view) and the boss charge telegraph.

import { useEffect, useRef, useState } from 'react';
import type { FamiliarState } from '@/game';
import AffinityChip from './AffinityChip';
import type { Matchup } from '@/components/game/affinity';

interface FamiliarStatusCompactProps {
  familiar: FamiliarState;
  isBoss?: boolean;
  statusEffects?: Array<{ id: string; icon: string; duration?: number }>;
  /** Attacker-perspective affinity matchup; only rendered on the enemy panel. */
  matchup?: Matchup;
  /** Boss charge telegraph ("Gathering power — Guard!"). */
  charged?: boolean;
}

const MAX_STATUS_SLOTS = 10;

const MATCHUP_STYLES: Record<Exclude<Matchup, 'neutral'>, { glyph: string; label: string; className: string }> = {
  strong: { glyph: '▲', label: "You're strong", className: 'bg-teal/20 text-teal border-teal/50' },
  weak: { glyph: '▼', label: "You're weak", className: 'bg-error/20 text-error border-error/50' },
};

function FamiliarStatusCompact({
  familiar,
  isBoss = false,
  statusEffects = [],
  matchup = 'neutral',
  charged = false,
}: FamiliarStatusCompactProps) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0;
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0;
  const hpColor = hpRatio > 0.5 ? 'bg-teal' : hpRatio > 0.25 ? 'bg-warning' : 'bg-error';
  const matchupStyle = matchup === 'neutral' ? null : MATCHUP_STYLES[matchup];

  // Flash the HP bar when it takes damage (instant state change, so it stays
  // even under prefers-reduced-motion; only the fade is shortened by CSS).
  const previousHp = useRef(familiar.hp);
  const [hpFlashing, setHpFlashing] = useState(false);

  useEffect(() => {
    const dropped = familiar.hp < previousHp.current;
    previousHp.current = familiar.hp;
    // Always clear first: React runs the previous cleanup before the next
    // effect, so returning early on a heal/unchanged update would strand the
    // white flash on screen for the rest of the battle.
    setHpFlashing(false);
    if (!dropped) return;

    setHpFlashing(true);
    const timeoutId = window.setTimeout(() => setHpFlashing(false), 160);
    return () => window.clearTimeout(timeoutId);
  }, [familiar.hp]);

  return (
    <div className="pointer-events-none flex w-[280px] flex-col gap-1 rounded-md border-4 border-double border-[#3B3870] bg-[#1E1B4B] px-2 py-1.5 shadow-lg">
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-body text-sm font-semibold text-[#F0EFFF]">{familiar.name}</span>
          {familiar.level ? (
            <span className="shrink-0 font-mono text-[10px] text-text-muted">Lv{familiar.level}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <AffinityChip affinity={familiar.affinity} />
          {isBoss && (
            <span className="rounded-sm bg-error/20 px-1.5 py-px font-display text-[10px] font-semibold uppercase tracking-wider text-error">
              Boss
            </span>
          )}
        </span>
      </div>

      {matchupStyle && (
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-sm border px-1.5 py-px font-body text-[9px] font-medium ${matchupStyle.className}`}
        >
          <span aria-hidden="true">{matchupStyle.glyph}</span>
          {matchupStyle.label}
        </span>
      )}

      {charged && (
        <span className="flex items-center gap-1 rounded-sm border border-warning/60 bg-warning/20 px-1.5 py-0.5 font-display text-[10px] font-semibold text-warning">
          <span aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
            ⚡
          </span>
          Gathering power — Guard!
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-medium text-teal">HP</span>
        <div className="relative h-[6px] flex-1 overflow-hidden rounded-sm border border-[#2A2A45] bg-[#1A1A2E]">
          <div
            className={`h-full ${hpColor} transition-all duration-200 ease-out`}
            style={{ width: `${hpRatio * 100}%` }}
          />
          <div
            aria-hidden="true"
            className={`absolute inset-0 bg-white transition-opacity ease-out ${
              hpFlashing ? 'opacity-80 duration-75' : 'opacity-0 duration-300'
            }`}
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[#B8B5E0]">
          {Math.max(0, Math.floor(familiar.hp))}/{familiar.maxHp}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-medium text-accent">MP</span>
        <div className="h-[6px] flex-1 overflow-hidden rounded-sm border border-[#2A2A45] bg-[#1A1A2E]">
          <div
            className="h-full bg-accent transition-all duration-200 ease-out"
            style={{ width: `${mpRatio * 100}%` }}
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[#B8B5E0]">
          {Math.max(0, Math.floor(familiar.mp))}/{familiar.maxMp}
        </span>
      </div>

      <div className="grid grid-cols-10 gap-0.5 border-t-2 border-[#3B3870] pt-1">
        {Array.from({ length: MAX_STATUS_SLOTS }).map((_, i) => {
          const effect = statusEffects[i];
          return (
            <div key={effect?.id ?? `empty-${i}`} className="relative flex h-[18px] w-full items-center justify-center">
              {effect && (
                <>
                  <div className="flex h-full w-full items-center justify-center rounded-md bg-[#2D2A5E] text-[11px]">
                    {effect.icon}
                  </div>
                  {effect.duration !== undefined && (
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#1E1B4B] px-0.5 font-mono text-[8px] text-[#A5A3C4]">
                      {effect.duration}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FamiliarStatusCompact;
