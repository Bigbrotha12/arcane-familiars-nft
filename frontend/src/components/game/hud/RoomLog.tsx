// Scrollable room event log (newest at the bottom, auto-scrolls on update).

import ScrollableLog from '@/components/game/hud/ScrollableLog'

interface RoomLogProps {
  entries: string[]
}

function RoomLog({ entries }: RoomLogProps) {
  return <ScrollableLog title="Room Log" entries={entries} emptyText="No room events yet." />
}

export default RoomLog
