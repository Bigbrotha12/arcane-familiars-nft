// Full-canvas victory/defeat/fled overlay with rewards. Continue dismisses it
// via onContinue (GamePage emits BATTLE_CONTINUE to Phaser in Step 6).
// Reward lines rise in with a short stagger (DESIGN.md: cards rise in, 250ms
// ease-out) and stay readable when prefers-reduced-motion is set.

import { useEffect, useState, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import { getItem } from '@arcane-familiars/game-logic';
import type { BattleEndedPayload } from '@/game';

/** Rewards arrive as item ids; show the display name, falling back to the id. */
function itemNames(ids: string[]): string {
  return ids.map((id) => getItem(id)?.name ?? id).join(', ');
}

interface BattleOutcomeProps {
  outcome: BattleEndedPayload;
  onContinue: () => void;
}

interface RewardLineProps {
  index: number;
  entered: boolean;
  children: ReactNode;
  className?: string;
}

function RewardLine({ index, entered, children, className = '' }: RewardLineProps) {
  return (
    <p
      className={`font-mono text-xs tabular-nums transition-all duration-300 ease-out motion-reduce:transition-none ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      } ${className}`}
      style={{ transitionDelay: `${index * 70}ms` }}
    >
      {children}
    </p>
  );
}

function BattleOutcome({ outcome, onContinue }: BattleOutcomeProps) {
  const { outcome: result, rewards } = outcome;
  const isVictory = result === 'victory';

  // Flip one frame after mount so the CSS transition actually runs.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const title = isVictory ? 'Victory!' : result === 'defeat' ? 'Defeated...' : 'You Fled';
  const titleColor = isVictory ? 'text-teal' : result === 'defeat' ? 'text-error' : 'text-warning';
  const flavor = isVictory
    ? 'Your familiars prevailed!'
    : result === 'defeat'
      ? 'Your party has fallen... all loot found this run is lost.'
      : 'You escaped the encounter.';

  const levelUps: { name?: string; levels?: number; bench: boolean }[] = [];
  if (rewards?.levelUp) {
    levelUps.push({ name: rewards.activeFamiliarName, levels: rewards.levelUp, bench: false });
  }
  if (rewards?.benchLevelUp) {
    levelUps.push({ name: rewards.benchFamiliarName, levels: rewards.benchLevelUp, bench: true });
  }
  // Stagger budget: rewards first, then level-ups, then the recruit callout.
  let lineIndex = 0;

  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="hud-frame flex w-full max-w-[300px] flex-col items-center gap-4 rounded-md p-lg text-center">
        <h2 className={`font-display text-2xl font-semibold ${titleColor}`}>{title}</h2>

        <div className="flex w-full flex-col items-center gap-1.5">
          <p className="font-body text-xs text-[#B8B5E0]">{flavor}</p>

          {isVictory && rewards && (
            <div className="mt-0.5 flex w-full flex-col items-center gap-0.5">
              {rewards.currency > 0 && (
                <RewardLine index={lineIndex++} entered={entered} className="text-sm text-yellow">
                  +{rewards.currency} coins
                </RewardLine>
              )}
              {rewards.items.length > 0 && (
                <p className="font-body text-xs text-[#F0EFFF]">Found: {itemNames(rewards.items)}</p>
              )}
              {rewards.xp ? (
                <RewardLine index={lineIndex++} entered={entered} className="text-accent">
                  +{rewards.xp} XP · {rewards.activeFamiliarName ?? 'Active familiar'}
                </RewardLine>
              ) : null}
              {rewards.benchXp ? (
                <RewardLine index={lineIndex++} entered={entered} className="text-[#B8B5E0]">
                  +{rewards.benchXp} XP · {rewards.benchFamiliarName ?? rewards.benchFamiliarId ?? 'Bench'} (bench)
                </RewardLine>
              ) : null}
              {levelUps.map((entry) => (
                <RewardLine
                  key={`${entry.bench ? 'bench' : 'active'}-levelup`}
                  index={lineIndex++}
                  entered={entered}
                  className="font-display text-sm font-semibold text-teal"
                >
                  {entry.name ?? (entry.bench ? 'Bench familiar' : 'Active familiar')} levelled up! +{entry.levels}
                </RewardLine>
              ))}
              {rewards.recruitedName ? (
                <RewardLine
                  index={lineIndex++}
                  entered={entered}
                  className="font-display text-sm font-semibold text-pink"
                >
                  Recruited {rewards.recruitedName}!
                </RewardLine>
              ) : null}
            </div>
          )}

          {result === 'defeat' && outcome.lostLoot ? (
            <div className="mt-0.5 flex flex-col items-center gap-0.5">
              {outcome.lostLoot.currency > 0 && (
                <p className="font-mono text-sm tabular-nums text-error">-{outcome.lostLoot.currency} coins</p>
              )}
              {outcome.lostLoot.items.length > 0 && (
                <p className="font-body text-xs text-[#F0EFFF]">
                  Lost: {outcome.lostLoot.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <Button size="md" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

export default BattleOutcome;
