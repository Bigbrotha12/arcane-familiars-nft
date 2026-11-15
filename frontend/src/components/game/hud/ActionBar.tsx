// Bottom-center action bar: a hud-frame row of buttons. Generic — serves both
// the battle action buttons (Attack/Defend/Ability/Item/Swap/Run/Familiars)
// and the exploration room-exit navigation. Single layout source of truth so
// styling changes apply to both scenes automatically.
//
// Each button can carry an inline cost/benefit hint ("Defend · halves damage,
// +MP") and, when disabled, the reason it is unavailable ("Not enough MP",
// "On cooldown 2") instead of leaving the player guessing.

import { ReactNode } from 'react';
import Button from '@/components/ui/Button';

export interface ActionBarItem {
  key: string;
  label: string;
  icon?: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  /** Inline cost/benefit line under the label. */
  hint?: string;
  /** Why this action cannot be used right now. */
  disabledReason?: string;
  onClick: () => void;
}

interface ActionBarProps {
  items: ActionBarItem[];
}

// icon width (1rem for the icon span) + 56px for the label
const MIN_BUTTON_WIDTH = 'min-w-[72px]';

function ActionBar({ items }: ActionBarProps) {
  if (items.length === 0) return null;

  return (
    <div className="hud-frame pointer-events-auto flex flex-wrap items-stretch justify-center gap-1.5 rounded-md px-2 py-1.5">
      {items.map(({ key, label, icon, primary = false, disabled = false, hint, disabledReason, onClick }) => {
        const subline = disabled && disabledReason ? disabledReason : hint;
        return (
          <Button
            key={key}
            size="sm"
            variant={primary ? 'primary' : 'secondary'}
            disabled={disabled}
            onClick={onClick}
            title={disabled && disabledReason ? disabledReason : hint}
            className={`flex-1 flex-col gap-0 ${MIN_BUTTON_WIDTH} px-2 py-1 text-xs`}
          >
            <span className="flex items-center justify-center gap-1">
              {icon && (
                <span className="flex w-4 shrink-0 items-center justify-center text-sm leading-none">{icon}</span>
              )}
              <span className="whitespace-nowrap">{label}</span>
            </span>
            {subline && (
              <span
                className={`whitespace-nowrap font-mono text-[8px] leading-tight tracking-tight ${
                  disabled && disabledReason ? 'text-warning' : 'opacity-70'
                }`}
              >
                {subline}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export default ActionBar;
export { ActionBar };
