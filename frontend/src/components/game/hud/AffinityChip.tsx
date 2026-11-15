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
  const text = size === 'sm' ? 'text-[11px]' : 'text-[9px]';
  const dot = size === 'sm' ? 'h-2 w-2' : 'h-1.5 w-1.5';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-body font-medium leading-tight ${text} ${className}`}
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
