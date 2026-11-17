// Read-only Team roster on the world map: owned familiars, their real
// level-scaled stats (charm included), abilities and passive tiers. Purely
// presentational — GamePage passes the world-map snapshot's roster.

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import AffinityChip from './AffinityChip';
import { portraitPath } from '@/components/collection/entries';
import { buildTeamEntry, sortRoster, type TeamAbilityRow, type TeamEntry, type TeamPassiveView } from './team';
import type { RosterEntry } from '@/game';

interface TeamModalProps {
  open: boolean;
  roster: RosterEntry[];
  onClose: () => void;
}

/** Portrait with the same initial-letter fallback as the Codex card. */
function Portrait({ id, name, size }: { id: string; name: string; size: number }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#3B3870] bg-[#2D2A5E]"
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span
          aria-hidden="true"
          className="select-none font-display font-semibold text-accent/60"
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          {name.charAt(0)}
        </span>
      ) : (
        <img
          src={portraitPath(id)}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function AbilityRow({ ability }: { ability: TeamAbilityRow }) {
  const lockedLabel = ability.replaced ? 'Upgraded to Rank II' : `Learns at Lv ${ability.unlockLevel}`;

  return (
    <li className={`flex flex-col gap-0.5 ${ability.learned ? '' : 'opacity-50'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-body text-xs font-medium text-[#F0EFFF]">{ability.name}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-[#A5A3C4]">
          {ability.learned ? `MP ${ability.mpCost} · CD ${ability.cooldown}` : lockedLabel}
        </span>
      </div>
      <p className="font-body text-xs leading-snug text-[#B8B5E0]">{ability.description}</p>
    </li>
  );
}

function PassiveSection({ passive }: { passive: TeamPassiveView }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="font-display text-xs font-semibold text-[#F0EFFF]">Passive · {passive.name}</h4>
      {passive.tier === 0 && (
        <p className="font-body text-xs text-[#A5A3C4]">
          No passive yet — unlocks at Lv {passive.tiers[0]?.level ?? 5}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {passive.tiers.map((row) => {
          const muted = !row.unlocked;
          return (
            <li
              key={row.tier}
              className={`rounded-md border px-2 py-1 ${
                row.current
                  ? 'border-teal/60 bg-teal/10'
                  : muted
                    ? 'border-[#3B3870]/60 bg-[#2D2A5E]/30 opacity-50'
                    : 'border-[#3B3870] bg-[#2D2A5E]/40'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs tabular-nums text-[#A5A3C4]">Lv {row.level}</span>
                <span className={`font-body text-[11px] ${row.current ? 'text-teal' : 'text-[#A5A3C4]'}`}>
                  {row.current ? 'Current' : row.unlocked ? 'Unlocked' : `Unlocks at Lv ${row.level}`}
                </span>
              </div>
              <p className="font-body text-xs leading-snug text-[#B8B5E0]">{row.description}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TeamDetail({ entry }: { entry: TeamEntry }) {
  const xpPct = entry.xpToNext > 0 ? Math.min(100, Math.round((entry.xp / entry.xpToNext) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <header className="flex items-start gap-2">
        <Portrait key={entry.id} id={entry.id} name={entry.name} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-display text-lg font-semibold text-[#F0EFFF]">{entry.name}</h3>
            <AffinityChip affinity={entry.affinity} size="sm" unscaled />
            <span className="font-mono text-xs tabular-nums text-[#F0EFFF]">Lv {entry.level}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#3B3870]"
              role="progressbar"
              aria-label={`${entry.name} XP`}
              aria-valuemin={0}
              aria-valuemax={entry.xpToNext}
              aria-valuenow={entry.xp}
            >
              <div className="h-full rounded-full bg-teal" style={{ width: `${xpPct}%` }} />
            </div>
            <span className="shrink-0 font-mono text-xs tabular-nums text-[#A5A3C4]">
              {entry.xp} / {entry.xpToNext}
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-1.5">
        {entry.stats.map((stat) => (
          <div key={stat.key} className="rounded-md border border-[#3B3870] bg-[#2D2A5E]/60 px-1.5 py-1">
            <div className="font-body text-[10px] uppercase tracking-wider text-[#A5A3C4]">{stat.label}</div>
            <div className="font-mono text-xs font-semibold tabular-nums text-[#F0EFFF]">
              {stat.value}
              {stat.bonus > 0 && <span className="ml-1 text-teal">(+{stat.bonus})</span>}
            </div>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-0.5">
        <h4 className="font-display text-xs font-semibold text-[#F0EFFF]">Charm</h4>
        {entry.charm ? (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-body text-xs font-medium text-[#F0EFFF]">◆ {entry.charm.name}</span>
            <span className="font-mono text-xs tabular-nums text-[#B8B5E0]">{entry.charm.modsLabel}</span>
          </p>
        ) : (
          <p className="font-body text-xs text-[#A5A3C4]">No charm — equip one from Charms</p>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h4 className="font-display text-xs font-semibold text-[#F0EFFF]">Abilities</h4>
        <ul className="flex flex-col gap-1.5">
          {entry.abilities.map((ability) => (
            <AbilityRow key={ability.id} ability={ability} />
          ))}
        </ul>
      </section>

      {entry.passive && <PassiveSection passive={entry.passive} />}
    </div>
  );
}

function TeamModal({ open, roster, onClose }: TeamModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries = sortRoster(roster).map((entry) => buildTeamEntry(entry));
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  return (
    <Modal open={open} onClose={onClose} title="Team" hud wide>
      {entries.length === 0 ? (
        <p className="font-body text-sm text-[#A5A3C4]">No familiars owned yet.</p>
      ) : (
        <div className="flex max-h-[460px] gap-3 max-sm:max-h-[68vh] max-sm:flex-col max-sm:gap-2">
          <div className="flex w-[184px] shrink-0 flex-col gap-1 overflow-y-auto pr-1 max-sm:w-full max-sm:flex-row max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:pb-1">
            {entries.map((entry) => {
              const active = selected?.id === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(entry.id)}
                  className={`flex items-center gap-2 rounded-md border p-1.5 text-left transition-colors max-sm:min-w-[150px] ${
                    active ? 'border-accent bg-[#2D2A5E]' : 'border-[#3B3870] bg-[#2D2A5E]/50 hover:bg-[#2D2A5E]'
                  }`}
                >
                  <Portrait id={entry.id} name={entry.name} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-body text-xs font-medium text-[#F0EFFF]">{entry.name}</span>
                    <span className="font-mono text-xs tabular-nums text-[#A5A3C4]">Lv {entry.level}</span>
                  </span>
                  {entry.inParty && (
                    <span className="shrink-0 rounded-full bg-teal/20 px-1.5 py-px font-body text-[10px] font-medium text-teal">
                      In party
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
            {selected && <TeamDetail entry={selected} />}
          </div>
        </div>
      )}
      <p className="mt-2 font-body text-xs text-[#A5A3C4]">Pick your party when you enter a dungeon.</p>
    </Modal>
  );
}

export default TeamModal;
export { TeamModal };
