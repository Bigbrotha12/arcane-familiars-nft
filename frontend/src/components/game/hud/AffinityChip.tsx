// Affinity chip: a small code-drawn glyph dot plus the affinity name, coloured
// from the DESIGN.md palette. No image assets.

import { affinityColor } from '@/components/game/affinity';

interface AffinityChipProps {
  affinity?: string;
  /** `xs` for combatant panels, `sm` for cards and dialogs. */
  size?: 'xs' | 'sm';
  className?: string;
}

function AffinityChip({ affinity, size = 'xs', className = '' }: AffinityChipProps) {
  if (!affinity) return null;
  const color = affinityColor(affinity);
  // `max-sm:` doubles the design-space size so the chip stays legible once the
  // 800x600 HUD stage is scaled onto a phone canvas.
  const text = size === 'sm' ? 'text-[11px] max-sm:text-[17px]' : 'text-[9px] max-sm:text-[15px]';
  const dot = size === 'sm' ? 'h-2 w-2 max-sm:h-3 max-sm:w-3' : 'h-1.5 w-1.5 max-sm:h-2.5 max-sm:w-2.5';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-body font-medium leading-tight max-sm:px-2 ${text} ${className}`}
      style={{ color, borderColor: `${color}66`, backgroundColor: `${color}22` }}
    >
      <span
        aria-hidden="true"
        className={`inline-block rotate-45 rounded-[1px] ${dot}`}
        style={{ backgroundColor: color }}
      />
      {affinity}
    </span>
  );
}

export default AffinityChip;
