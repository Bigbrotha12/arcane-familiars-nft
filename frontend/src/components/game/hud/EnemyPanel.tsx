// Enemy battle card: name, optional BOSS badge, and an HP bar with values.
// Anchored over the canvas; non-interactive so clicks pass through.

import Badge from '@/components/ui/Badge'
import StatBar from './StatBar'
import type { FamiliarState } from '@/game'

interface EnemyPanelProps {
  enemy: FamiliarState
  isBoss?: boolean
}

function EnemyPanel({ enemy, isBoss = false }: EnemyPanelProps) {
  return (
    <div className="pointer-events-none w-52 rounded-md bg-[#1E1B4B]/80 p-sm shadow-card backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="truncate font-display text-sm font-semibold text-[#F0EFFF]">{enemy.name}</h2>
        {isBoss && <Badge variant="epic">BOSS</Badge>}
      </div>
      <StatBar label="HP" current={enemy.hp} max={enemy.maxHp} kind="hp" showValues />
    </div>
  )
}

export default EnemyPanel