// Bottom-center action bar: a hud-frame row of buttons. Generic — serves both
// the battle action buttons (Attack/Defend/Ability/Item/Swap/Run/Familiars)
// and the exploration room-exit navigation. Single layout source of truth so
// styling changes apply to both scenes automatically.
// Buttons have a uniform width: an optional icon in front of the label and a
// min-width of icon width + 75px so every label gets the same footprint.

import { ReactNode } from 'react'
import Button from '@/components/ui/Button'

export interface ActionBarItem {
  key: string
  label: string
  icon?: ReactNode
  primary?: boolean
  disabled?: boolean
  onClick: () => void
}

interface ActionBarProps {
  items: ActionBarItem[]
}

// icon width (1.25rem for the icon span) + 75px for the label
const MIN_BUTTON_WIDTH = 'min-w-[95px]'

function ActionBar({ items }: ActionBarProps) {
  if (items.length === 0) return null

  return (
    <div className="hud-frame pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-md p-md">
      {items.map(({ key, label, icon, primary = false, disabled = false, onClick }) => (
        <Button
          key={key}
          size="sm"
          variant={primary ? 'primary' : 'secondary'}
          disabled={disabled}
          onClick={onClick}
          className={`flex-1 ${MIN_BUTTON_WIDTH}`}
        >
          {icon && (
            <span className="flex w-[1.25rem] shrink-0 items-center justify-center text-base leading-none">
              {icon}
            </span>
          )}
          <span className="whitespace-nowrap">{label}</span>
        </Button>
      ))}
    </div>
  )
}

export default ActionBar
export { ActionBar }