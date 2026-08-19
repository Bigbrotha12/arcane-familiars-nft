// Bottom-center battle action buttons (Attack/Defend/Ability/Item/Swap/Run).
// Emits the chosen action via onAction; Ability/Item open their modals in
// BattleHUD instead of emitting immediately.

import Button from '@/components/ui/Button'
import type { BattleActionName } from '@/game'

interface ActionBarProps {
  disabled?: boolean
  canSwap?: boolean
  onAction: (action: BattleActionName) => void
}

const ACTIONS: { label: string; action: BattleActionName; primary?: boolean; needsParty?: boolean }[] = [
  { label: 'Attack', action: 'attack', primary: true },
  { label: 'Defend', action: 'defend' },
  { label: 'Ability', action: 'ability' },
  { label: 'Item', action: 'item' },
  { label: 'Swap', action: 'swap', needsParty: true },
  { label: 'Run', action: 'run' },
]

function ActionBar({ disabled = false, canSwap = false, onAction }: ActionBarProps) {
  return (
    <div className="hud-frame pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-md p-sm">
      {ACTIONS.map(({ label, action, primary = false, needsParty = false }) => (
        <Button
          key={action}
          size="sm"
          variant={primary ? 'primary' : 'secondary'}
          disabled={disabled || (needsParty && !canSwap)}
          onClick={() => onAction(action)}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

export default ActionBar
