// Exploration HUD overlay for the embedded Phaser game. Composes the mini-map,
// room info, room log, party panel, navigation bar, and conditional overlays
// (encounter/treasure/boss). Fully presentational: receives a GameStateSnapshot
// and emits callbacks — GamePage owns event-bus wiring (Step 6).

import MiniMap from './MiniMap'
import RoomInfo from './RoomInfo'
import CombinedControlsPanel from './CombinedControlsPanel'
import EncounterOverlay from './EncounterOverlay'
import TreasureOverlay from './TreasureOverlay'
import BossOverlay from './BossOverlay'
import type { ActionBarItem } from './ActionBar'
import type { GameStateSnapshot } from '@/game'

interface ExplorationHUDProps {
  snapshot: GameStateSnapshot
  onNavigate: (roomId: string) => void
  onCollectTreasure: () => void
  onFleeEncounter: () => void
  onStartBattle: () => void
  onSwapClick?: (familiarId: string) => void
}

function ExplorationHUD({
  snapshot,
  onNavigate,
  onCollectTreasure,
  onFleeEncounter,
  onStartBattle,
  onSwapClick,
}: ExplorationHUDProps) {
  if (snapshot.currentScene !== 'exploration' || !snapshot.dungeon) {
    return null
  }

  const dungeon = snapshot.dungeon
  const currentRoom = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId) ?? null
  const overlayActive =
    snapshot.encounterActive || snapshot.treasureActive || snapshot.bossRoom

  const exitActions: ActionBarItem[] = (currentRoom?.exits ?? [])
    .filter((exit, index, all) => all.findIndex((e) => e.roomId === exit.roomId) === index)
    .map((exit) => ({
      key: exit.roomId,
      label: exit.label || exit.direction.charAt(0).toUpperCase() + exit.direction.slice(1),
      onClick: () => onNavigate(exit.roomId),
    }))

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-4 top-4">
        <MiniMap dungeon={dungeon} />
      </div>

      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <RoomInfo snapshot={snapshot} />
      </div>

      {/* Combined bottom panel */}
      {!overlayActive && (
        <CombinedControlsPanel
          actions={exitActions}
          logEntries={snapshot.roomLog ?? []}
          party={snapshot.familiars}
          activeId={snapshot.activeId ?? snapshot.familiars[0]?.id}
          onSwapClick={onSwapClick}
        />
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
