// Full-canvas victory/defeat/fled overlay with rewards. Continue dismisses it
// via onContinue (GamePage emits BATTLE_CONTINUE to Phaser in Step 6).

import Button from '@/components/ui/Button';
import type { BattleEndedPayload } from '@/game';

interface BattleOutcomeProps {
  outcome: BattleEndedPayload;
  onContinue: () => void;
}

function BattleOutcome({ outcome, onContinue }: BattleOutcomeProps) {
  const { outcome: result, rewards } = outcome;
  const isVictory = result === 'victory';

  const title = isVictory ? 'Victory!' : result === 'defeat' ? 'Defeated...' : 'You Fled';
  const titleColor = isVictory ? 'text-teal' : result === 'defeat' ? 'text-error' : 'text-warning';
  const flavor = isVictory
    ? 'Your familiars prevailed!'
    : result === 'defeat'
      ? 'Your party has fallen... all loot found this run is lost.'
      : 'You escaped the encounter.';

  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="hud-frame flex w-full max-w-[280px] flex-col items-center gap-4 rounded-md p-lg text-center">
        <h2 className={`font-display text-2xl font-semibold ${titleColor}`}>{title}</h2>

        <div className="flex flex-col items-center gap-1.5">
          <p className="font-body text-xs text-[#B8B5E0]">{flavor}</p>

          {isVictory && rewards && (
            <div className="mt-0.5 flex flex-col items-center gap-0.5">
              {rewards.currency > 0 && (
                <p className="font-mono text-sm tabular-nums text-yellow">+{rewards.currency} coins</p>
              )}
              {rewards.items.length > 0 && (
                <p className="font-body text-xs text-[#F0EFFF]">Found: {rewards.items.join(', ')}</p>
              )}
              {rewards.xp ? <p className="font-mono text-xs tabular-nums text-accent">+{rewards.xp} XP</p> : null}
              {rewards.levelUp ? (
                <p className="font-display text-sm font-semibold text-teal">Level up! +{rewards.levelUp}</p>
              ) : null}
              {rewards.recruitedName ? (
                <p className="font-display text-sm font-semibold text-pink">Recruited {rewards.recruitedName}!</p>
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
                  Lost: {outcome.lostLoot.items.map((item) => `${item.itemId} x${item.quantity}`).join(', ')}
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
