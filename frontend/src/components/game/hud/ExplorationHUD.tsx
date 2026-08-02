// Exploration HUD overlay for the embedded Phaser game. Composes the mini-map,
// room info, room log, party panel, navigation bar, and conditional overlays
// (encounter/treasure/boss). Fully presentational: receives a GameStateSnapshot
// and emits callbacks — GamePage owns event-bus wiring (Step 6).

import MiniMap from './MiniMap'
import RoomInfo from './RoomInfo'
import RoomLog from './RoomLog'
import PartyPanel from './PartyPanel'
import NavigationBar from './NavigationBar'
import EncounterOverlay from './EncounterOverlay'
import TreasureOverlay from './TreasureOverlay'
import BossOverlay from './BossOverlay'
import type { GameStateSnapshot, ExploreDirection } from '@/game'

interface ExplorationHUDProps {
  snapshot: GameStateSnapshot
  onNavigate: (direction: ExploreDirection) => void
  onCollectTreasure: () => void
  onFleeEncounter: () => void
  onStartBattle: () => void
}

function ExplorationHUD({
  snapshot,
  onNavigate,
  onCollectTreasure,
  onFleeEncounter,
  onStartBattle,
}: ExplorationHUDProps) {
  if (snapshot.currentScene !== 'exploration' || !snapshot.dungeon) {
    return null
  }

  const dungeon = snapshot.dungeon
  const currentRoom = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId) ?? null
  const overlayActive =
    snapshot.encounterActive || snapshot.treasureActive || snapshot.bossRoom

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-4 top-4">
        <MiniMap dungeon={dungeon} />
      </div>

      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <RoomInfo snapshot={snapshot} />
      </div>

      <div className="absolute right-4 top-4">
        <RoomLog entries={snapshot.roomLog ?? []} />
      </div>

      <div className="absolute bottom-4 left-4">
        <PartyPanel party={snapshot.familiars} />
      </div>

      {!overlayActive && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <NavigationBar room={currentRoom} onNavigate={onNavigate} />
        </div>
      )}

      {snapshot.encounterActive ? (
        <EncounterOverlay onFight={onStartBattle} onFlee={onFleeEncounter} />
      ) : snapshot.treasureActive ? (
        <TreasureOverlay onTake={onCollectTreasure} onLeave={onFleeEncounter} />
      ) : snapshot.bossRoom ? (
        <BossOverlay onEnter={onStartBattle} onRetreat={onFleeEncounter} />
      ) : null}
    </div>
  )
}

export default ExplorationHUD
export { ExplorationHUD }
