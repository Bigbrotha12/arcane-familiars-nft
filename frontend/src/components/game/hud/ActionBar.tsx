// Bottom-center action bar: a hud-frame row of buttons. Generic — serves both
// the battle action buttons (Attack/Defend/Ability/Item/Swap/Run) and the
// exploration room-exit navigation. Single layout source of truth so styling
// changes apply to both scenes automatically.

import Button from '@/components/ui/Button'

export interface ActionBarItem {
  key: string
  label: string
  primary?: boolean
  disabled?: boolean
  onClick: () => void
}

interface ActionBarProps {
  items: ActionBarItem[]
}

function ActionBar({ items }: ActionBarProps) {
  if (items.length === 0) return null

  return (
    <div className="hud-frame pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-md p-md">
      {items.map(({ key, label, primary = false, disabled = false, onClick }) => (
        <Button
          key={key}
          size="sm"
          variant={primary ? 'primary' : 'secondary'}
          disabled={disabled}
          onClick={onClick}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

export default ActionBar
export { ActionBar }