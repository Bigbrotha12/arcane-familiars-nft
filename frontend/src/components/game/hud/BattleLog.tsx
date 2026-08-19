// Single-latest-event battle log (bottom text box).

import EventBox from '@/components/game/hud/EventBox'

interface BattleLogProps {
  entries: string[]
}

function BattleLog({ entries }: BattleLogProps) {
  return <EventBox title="Battle Log" entries={entries} emptyText="No battle events yet." />
}

export default BattleLog