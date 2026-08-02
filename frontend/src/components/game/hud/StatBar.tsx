// Shared HP/MP bar for battle HUD panels. Renders a labeled track with a
// threshold-colored fill (teal >50%, amber >25%, red below; grey for MP) and
// an optional numeric readout. Pure presentational — no event bus, no state.

interface StatBarProps {
  label: string
  current: number
  max: number
  kind?: 'hp' | 'mp'
  showValues?: boolean
}

function StatBar({ label, current, max, kind = 'hp', showValues = false }: StatBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0
  const fillColor =
    kind === 'mp' ? 'bg-[#6366A1]' : ratio > 0.5 ? 'bg-teal' : ratio > 0.25 ? 'bg-warning' : 'bg-error'
  const height = kind === 'mp' ? 'h-2' : 'h-3'

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-body text-xs font-medium text-[#B8B5E0]">{label}</span>
        {showValues && (
          <span className="font-mono text-xs tabular-nums text-[#B8B5E0]">
            {Math.max(0, Math.floor(current))}/{Math.max(0, max)}
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.max(0, Math.floor(current))}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, max)}
        className={`mt-0.5 ${height} w-full overflow-hidden rounded-[3px] border border-[#2A2A45] bg-[#1A1A2E]`}
      >
        <div
          className={`h-full ${fillColor} transition-all duration-300`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}

export default StatBar
