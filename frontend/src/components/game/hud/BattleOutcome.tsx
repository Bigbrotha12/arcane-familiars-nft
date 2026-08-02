// Full-canvas victory/defeat/fled overlay with rewards. Continue dismisses it
// via onContinue (GamePage emits BATTLE_CONTINUE to Phaser in Step 6).

import Button from '@/components/ui/Button'
import type { BattleEndedPayload } from '@/game'

interface BattleOutcomeProps {
  outcome: BattleEndedPayload
  onContinue: () => void
}

function BattleOutcome({ outcome, onContinue }: BattleOutcomeProps) {
  const { outcome: result, rewards } = outcome
  const isVictory = result === 'victory'

  const title = isVictory ? 'Victory!' : result === 'defeat' ? 'Defeated...' : 'You Fled'
  const titleColor = isVictory ? 'text-teal' : result === 'defeat' ? 'text-error' : 'text-warning'
  const flavor = isVictory
    ? 'Your familiars prevailed!'
    : result === 'defeat'
      ? 'Your party has fallen...'
      : 'You escaped the encounter.'

  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-md bg-[#1E1B4B]/95 p-xl text-center shadow-card-hover">
        <h2 className={`font-display text-3xl font-semibold ${titleColor}`}>{title}</h2>

        <div className="flex flex-col items-center gap-2">
          <p className="font-body text-sm text-[#B8B5E0]">{flavor}</p>

          {isVictory && rewards && (
            <div className="mt-1 flex flex-col items-center gap-1">
              {rewards.currency > 0 && (
                <p className="font-mono text-base tabular-nums text-yellow">
                  +{rewards.currency} coins
                </p>
              )}
              {rewards.items.length > 0 && (
                <p className="font-body text-sm text-[#F0EFFF]">
                  Found: {rewards.items.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        <Button size="lg" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}

export default BattleOutcome
