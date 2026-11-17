// Exploration HUD overlay for the embedded Phaser game. Composes the mini-map,
// room info, room log, party panel, navigation bar, and conditional overlays
// (encounter/treasure/boss). Fully presentational: receives a GameStateSnapshot
// and emits callbacks — GamePage owns event-bus wiring (Step 6).

import { useEffect, useState } from 'react';
import MiniMap from './MiniMap';
import RoomInfo from './RoomInfo';
import CombinedControlsPanel from './CombinedControlsPanel';
import EncounterOverlay from './EncounterOverlay';
import TreasureOverlay from './TreasureOverlay';
import CurioOverlay from './CurioOverlay';
import BossOverlay from './BossOverlay';
import FieldItemPanel from './FieldItemPanel';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { ActionBarItem } from './ActionBar';
import type { GameStateSnapshot } from '@/game';

const DIRECTION_ICONS: Record<string, string> = {
  north: '▲',
  south: '▼',
  east: '►',
  west: '◄',
  northeast: '▲►',
  northwest: '▲◄',
  southeast: '▼►',
  southwest: '▼◄',
};

function getDirectionIcon(direction: string): string | null {
  return DIRECTION_ICONS[direction] ?? null;
}

interface ExplorationHUDProps {
  snapshot: GameStateSnapshot;
  onNavigate: (roomId: string) => void;
  onCollectTreasure: () => void;
  onFleeEncounter: () => void;
  onStartBattle: () => void;
  onSwapClick?: (familiarId: string) => void;
  onCurioChoice: (optionId: string) => void;
  onCurioLeave: () => void;
  onCurioContinue: () => void;
  onFieldUseItem: (itemId: string, familiarId?: string) => void;
  onLeaveDungeon: () => void;
}

type ExplorationPanel = 'items' | 'leave' | null;

function ExplorationHUD({
  snapshot,
  onNavigate,
  onCollectTreasure,
  onFleeEncounter,
  onStartBattle,
  onSwapClick,
  onCurioChoice,
  onCurioLeave,
  onCurioContinue,
  onFieldUseItem,
  onLeaveDungeon,
}: ExplorationHUDProps) {
  const [panel, setPanel] = useState<ExplorationPanel>(null);
  const sceneKey = snapshot.currentScene;
  const overlayActive =
    snapshot.encounterActive ||
    snapshot.treasureActive ||
    snapshot.bossRoom ||
    Boolean(snapshot.curio) ||
    Boolean(snapshot.curioResult);

  // Panels are local to one exploration screen: leaving the scene or an
  // overlay taking over closes them so they cannot reappear stale.
  useEffect(() => {
    setPanel(null);
  }, [sceneKey, overlayActive]);

  if (sceneKey !== 'exploration' || !snapshot.dungeon) {
    return null;
  }

  const dungeon = snapshot.dungeon;
  const currentRoom = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId) ?? null;
  const atEntrance = currentRoom?.type === 'Start';
  const fieldItemCount = (snapshot.fieldItems ?? []).reduce((total, item) => total + item.quantity, 0);

  const controls: ActionBarItem[] = (currentRoom?.exits ?? [])
    .filter((exit, index, all) => all.findIndex((e) => e.roomId === exit.roomId) === index)
    .map((exit) => ({
      key: exit.roomId,
      label: exit.label || exit.direction.charAt(0).toUpperCase() + exit.direction.slice(1),
      icon: getDirectionIcon(exit.direction),
      onClick: () => onNavigate(exit.roomId),
    }));

  controls.push({
    key: 'items',
    label: 'Items',
    icon: '🎒',
    hint: fieldItemCount > 0 ? `${fieldItemCount} in bag` : 'none',
    onClick: () => setPanel('items'),
  });

  if (atEntrance) {
    controls.push({
      key: 'leave-dungeon',
      label: 'Leave dungeon',
      icon: '🚪',
      onClick: () => setPanel('leave'),
    });
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-4 top-4">
        <MiniMap dungeon={dungeon} />
      </div>

      {/* Wide canvases centre the room card; phones put it top-right so the
          enlarged mini-map and the card do not overlap. */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 max-sm:left-auto max-sm:right-4 max-sm:translate-x-0">
        <RoomInfo snapshot={snapshot} />
      </div>

      {/* Combined bottom panel */}
      {!overlayActive && (
        <CombinedControlsPanel
          actions={controls}
          logEntries={snapshot.roomLog ?? []}
          party={snapshot.familiars}
          activeId={snapshot.activeId ?? snapshot.familiars[0]?.id}
          onSwapClick={onSwapClick}
        />
      )}

      {snapshot.encounterActive ? (
        <EncounterOverlay
          onFight={onStartBattle}
          onFlee={onFleeEncounter}
          encounter={snapshot.pendingEncounter}
          party={snapshot.familiars}
          activeId={snapshot.activeId}
          recruitBond={snapshot.recruitBond}
          ownedFamiliars={snapshot.ownedFamiliars}
        />
      ) : snapshot.treasureActive ? (
        <TreasureOverlay treasure={snapshot.treasure} onTake={onCollectTreasure} onLeave={onFleeEncounter} />
      ) : snapshot.curio || snapshot.curioResult ? (
        <CurioOverlay
          curio={snapshot.curio}
          result={snapshot.curioResult}
          onChoose={onCurioChoice}
          onLeave={onCurioLeave}
          onContinue={onCurioContinue}
        />
      ) : snapshot.bossRoom ? (
        <BossOverlay
          onEnter={onStartBattle}
          onRetreat={onFleeEncounter}
          encounter={snapshot.pendingEncounter}
          party={snapshot.familiars}
          activeId={snapshot.activeId}
        />
      ) : null}

      <FieldItemPanel
        open={panel === 'items' && !overlayActive}
        items={snapshot.fieldItems ?? []}
        party={snapshot.familiars}
        onUse={(itemId, familiarId) => {
          setPanel(null);
          onFieldUseItem(itemId, familiarId);
        }}
        onClose={() => setPanel(null)}
      />

      <Modal
        open={panel === 'leave' && !overlayActive}
        onClose={() => setPanel(null)}
        title="Leave dungeon"
        hud
        compact
      >
        <p className="font-body text-xs text-[#B8B5E0]">Leave the dungeon? You keep everything in your run loot.</p>
        <div className="mt-sm flex gap-2">
          <Button
            variant="secondary"
            className="flex-1 px-2 py-1 text-xs"
            onClick={() => {
              setPanel(null);
              onLeaveDungeon();
            }}
          >
            Leave
          </Button>
          <Button variant="ghost" className="flex-1 px-2 py-1 text-xs" onClick={() => setPanel(null)}>
            Stay
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default ExplorationHUD;
export { ExplorationHUD };
