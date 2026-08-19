// Single-latest-event room log (bottom text box).

import EventBox from '@/components/game/hud/EventBox'

interface RoomLogProps {
  entries: string[]
}

function RoomLog({ entries }: RoomLogProps) {
  return <EventBox title="Room Log" entries={entries} emptyText="No room events yet." />
}

export default RoomLog