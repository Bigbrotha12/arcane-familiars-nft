// Scrollable battle event log (newest at the bottom, auto-scrolls on update).

import ScrollableLog from '@/components/game/hud/ScrollableLog'

interface BattleLogProps {
  entries: string[]
}

function BattleLog({ entries }: BattleLogProps) {
  return <ScrollableLog title="Battle Log" entries={entries} emptyText="No battle events yet." />
}

export default BattleLog
