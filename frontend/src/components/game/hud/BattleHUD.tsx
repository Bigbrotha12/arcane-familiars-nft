// Battle HUD overlay for the embedded Phaser game. Composes combatant status
// cards (near the sprites), the arc party panel, battle log, action bar,
// ability/item modals, and outcome screen. Fully presentational: receives a
// GameStateSnapshot + BattleEndedPayload and emits callbacks — GamePage owns
// event-bus wiring (Step 6).

import { useState } from 'react'
import FamiliarStatusCompact from './FamiliarStatusCompact'
import CombinedControlsPanel from './CombinedControlsPanel'
import AbilityPanel from './AbilityPanel'
import ItemPanel from './ItemPanel'
import FamiliarsPanel from './FamiliarsPanel'
import BattleOutcome from './BattleOutcome'
import type { ActionBarItem } from './ActionBar'
import type { GameStateSnapshot, BattleEndedPayload, BattleActionName, PlayerActionPayload } from '@/game'

interface BattleHUDProps {
  snapshot: GameStateSnapshot
  outcome: BattleEndedPayload | null
  onAction: (action: BattleActionName, payload?: PlayerActionPayload['payload']) => void
  onContinue: () => void
}

type ActivePanel = 'ability' | 'item' | 'familiars' | null

function BattleHUD({ snapshot, outcome, onAction, onContinue }: BattleHUDProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)

  if (
    snapshot.currentScene !== 'battle' ||
    !snapshot.enemy ||
    !snapshot.phase ||
    snapshot.phase === 'connecting'
  ) {
    return null
  }

  const enemy = snapshot.enemy
  const disabled = snapshot.phase === 'acting' || outcome !== null
  const party = snapshot.party ?? snapshot.familiars
  const activeFamiliar = party[0] ?? snapshot.familiars[0]

  const handleAction = (action: BattleActionName) => {
    if (action === 'ability') setActivePanel('ability')
    else if (action === 'item') setActivePanel('item')
    else onAction(action)
  }

  const handleAbilitySelect = (abilityId: string) => {
    setActivePanel(null)
    onAction('ability', { abilityId })
  }

  const handleItemSelect = (itemId: string) => {
    setActivePanel(null)
    onAction('item', { itemId })
  }

  const handleFamiliarSelect = (familiarId: string) => {
    setActivePanel(null)
    onAction('swap', { targetId: familiarId })
  }

  const actions: ActionBarItem[] = [
    { key: 'attack', label: 'Attack', icon: '⚔️', primary: true, onClick: () => handleAction('attack') },
    { key: 'defend', label: 'Defend', icon: '🛡️', onClick: () => handleAction('defend') },
    { key: 'ability', label: 'Ability', icon: '✨', onClick: () => handleAction('ability') },
    { key: 'item', label: 'Item', icon: '🎒', onClick: () => handleAction('item') },
    { key: 'swap', label: 'Swap', icon: '🔄', disabled: !snapshot.canSwap, onClick: () => handleAction('swap') },
    { key: 'familiars', label: 'Familiars', icon: '🐾', onClick: () => setActivePanel('familiars') },
    { key: 'run', label: 'Run', icon: '🏃', onClick: () => handleAction('run') },
  ].map((action) => ({ ...action, disabled: disabled || action.disabled }))

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Enemy status card - top left corner */}
        {enemy && (
          <div
            className="absolute"
            style={{ left: '16px', top: '16px' }}
          >
            <FamiliarStatusCompact familiar={enemy} isBoss={snapshot.isBoss} />
          </div>
        )}

{/* Player status card - right corner, above action bar */}
        {activeFamiliar && (
          <div
            className="absolute"
            style={{ right: '16px', bottom: '240px' }}
          >
            <FamiliarStatusCompact familiar={activeFamiliar} />
          </div>
        )}

        {/* Combined bottom panel */}
        <CombinedControlsPanel
          actions={actions}
          logEntries={snapshot.battleLog ?? []}
          party={party}
          activeId={activeFamiliar?.id}
        />

        {outcome && <BattleOutcome outcome={outcome} onContinue={onContinue} />}
      </div>

      <AbilityPanel
        open={activePanel === 'ability'}
        abilities={snapshot.abilities ?? []}
        onSelect={handleAbilitySelect}
        onClose={() => setActivePanel(null)}
      />

      <ItemPanel
        open={activePanel === 'item'}
        items={snapshot.items ?? []}
        onSelect={handleItemSelect}
        onClose={() => setActivePanel(null)}
      />

      <FamiliarsPanel
        open={activePanel === 'familiars'}
        party={party}
        activeId={activeFamiliar?.id}
        onSelect={handleFamiliarSelect}
        onClose={() => setActivePanel(null)}
      />
    </>
  )
}

export default BattleHUD
