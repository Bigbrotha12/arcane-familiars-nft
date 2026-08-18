// Enemy battle card: name, optional BOSS badge, and an HP bar with values.
// Anchored top-left over the canvas; non-interactive so clicks pass through.

import Badge from '@/components/ui/Badge'
import StatBar from './StatBar'
import type { FamiliarState } from '@/game'

interface EnemyPanelProps {
  enemy: FamiliarState
  isBoss?: boolean
}

function EnemyPanel({ enemy, isBoss = false }: EnemyPanelProps) {
  return (
    <div className="hud-frame pointer-events-none w-52 rounded-md p-md">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="truncate font-display text-lg font-semibold text-[#F0EFFF]">{enemy.name}</h2>
        {isBoss && <Badge variant="epic">BOSS</Badge>}
      </div>
      <StatBar label="HP" current={enemy.hp} max={enemy.maxHp} kind="hp" showValues />
    </div>
  )
}

export default EnemyPanel
