// End-of-run summary on the world map. Shows what the run earned or cost:
// outcome, area, event counters, per-familiar XP/levels, best hit, unlocks and
// the banked (or lost) loot. Closing acknowledges the summary server-side.

import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { getFamiliar, getItem, type RunSummary, type RunSummaryLoot } from '@arcane-familiars/game-logic';
import type { RunSummaryPayload } from '@/game';

interface RunSummaryModalProps {
  open: boolean;
  payload: RunSummaryPayload | null;
  onClose: () => void;
}

const TITLES: Record<RunSummary['outcome'], { title: string; className: string }> = {
  cleared: { title: 'Dungeon cleared!', className: 'text-teal' },
  retreated: { title: 'You made it out', className: 'text-yellow' },
  defeated: { title: 'Your party fell', className: 'text-error' },
};

function formatLoot(loot: RunSummaryLoot): string {
  const parts: string[] = [];
  if (loot.currency > 0) parts.push(`${loot.currency} coins`);

  const counts = new Map<string, number>();
  for (const itemId of loot.items) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  const items = [...counts]
    .map(([itemId, quantity]) => {
      const name = getItem(itemId)?.name ?? itemId;
      return quantity > 1 ? `${name} ×${quantity}` : name;
    })
    .join(', ');
  if (items) parts.push(items);

  if (loot.charms) parts.push(`${loot.charms} charm${loot.charms === 1 ? '' : 's'}`);

  return parts.length > 0 ? parts.join(' · ') : 'Nothing';
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-[#3B3870] bg-[#2D2A5E]/60 px-1 py-2">
      <span className="font-mono text-base font-semibold tabular-nums text-[#F0EFFF]">{value}</span>
      <span className="font-body text-[9px] uppercase tracking-wider text-[#A5A3C4]">{label}</span>
    </div>
  );
}

function RunSummaryModal({ open, payload, onClose }: RunSummaryModalProps) {
  if (!payload) return null;

  const { summary, familiarLevels = {} } = payload;
  const { stats } = summary;
  const heading = TITLES[summary.outcome];

  const xpLines = Object.entries(stats.xpByFamiliar)
    .filter(([, xp]) => xp > 0)
    .map(([familiarId, xp]) => {
      const name = getFamiliar(familiarId)?.name ?? familiarId;
      const gained = stats.levelsByFamiliar[familiarId] ?? 0;
      const finalLevel = familiarLevels[familiarId];
      let levelText = '';
      if (gained > 0) {
        levelText = finalLevel !== undefined ? ` · Lv ${finalLevel - gained} → ${finalLevel}` : ` · +${gained} Lv`;
      }
      return { familiarId, text: `${name} +${xp} XP${levelText}` };
    });

  const tealLines = [
    ...stats.learned,
    ...stats.passiveUnlocks,
    ...stats.recruits.map((id) => `Recruited ${getFamiliar(id)?.name ?? id}`),
    ...Object.entries(stats.bondGains)
      .filter(([, gain]) => gain > 0)
      .map(([id, gain]) => `Bond with ${getFamiliar(id)?.name ?? id} +${gain}`),
  ];

  const bestHit = stats.bestHit;
  const bestHitName = bestHit ? (getFamiliar(bestHit.familiarId)?.name ?? bestHit.familiarId) : '';

  return (
    <Modal open={open} onClose={onClose} hud>
      <div className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="flex flex-col items-center gap-0.5 text-center">
          <h2 className={`font-display text-xl font-semibold ${heading.className}`}>{heading.title}</h2>
          <p className="font-body text-xs text-[#B8B5E0]">{summary.areaName}</p>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          <StatCell label="Battles" value={stats.battlesWon} />
          <StatCell label="Elites" value={stats.elitesWon} />
          <StatCell label="Rooms" value={stats.roomsExplored} />
          <StatCell label="Chests" value={stats.chestsOpened} />
          <StatCell label="Curios" value={stats.curiosUsed} />
        </div>

        {xpLines.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {xpLines.map((line) => (
              <p key={line.familiarId} className="font-mono text-xs tabular-nums text-accent">
                {line.text}
              </p>
            ))}
          </div>
        )}

        {bestHit && (
          <p className="font-mono text-xs tabular-nums text-[#FBBF24]">
            Best hit: {bestHit.abilityName} for {bestHit.damage} ({bestHitName})
          </p>
        )}

        {tealLines.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {tealLines.map((line, index) => (
              <p key={`${line}-${index}`} className="font-body text-xs text-teal">
                {line}
              </p>
            ))}
          </div>
        )}

        {summary.outcome === 'defeated' ? (
          <p className="font-mono text-xs tabular-nums text-error/80">
            Lost: {formatLoot(summary.lost ?? { currency: 0, items: [] })}
          </p>
        ) : (
          <p className="font-mono text-xs tabular-nums text-yellow">Loot: {formatLoot(summary.loot)}</p>
        )}

        <Button className="w-full" size="md" onClick={onClose}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}

export default RunSummaryModal;
