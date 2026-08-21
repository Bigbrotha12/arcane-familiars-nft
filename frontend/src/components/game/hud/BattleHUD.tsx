// Battle HUD overlay for the embedded Phaser game. Composes the enemy/party
// panels, battle log, action bar, ability/item modals, and outcome screen.
// Fully presentational: receives a GameStateSnapshot + BattleEndedPayload and
// emits callbacks — GamePage owns event-bus wiring (Step 6).

import { useState } from 'react'
import EnemyPanel from './EnemyPanel'
import PartyPanel from './PartyPanel'
import ActionBar from './ActionBar'
import AbilityPanel from './AbilityPanel'
import ItemPanel from './ItemPanel'
import BattleLog from './BattleLog'
import BattleOutcome from './BattleOutcome'
import type { GameStateSnapshot, BattleEndedPayload, BattleActionName, PlayerActionPayload } from '@/game'

interface BattleHUDProps {
  snapshot: GameStateSnapshot
  outcome: BattleEndedPayload | null
  onAction: (action: BattleActionName, payload?: PlayerActionPayload['payload']) => void
  onContinue: () => void
}

type ActivePanel = 'ability' | 'item' | null

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
  const activeId = snapshot.familiars[0]?.id

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

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute left-4 top-4">
          <EnemyPanel enemy={enemy} isBoss={snapshot.isBoss} />
        </div>

        <div className="absolute right-4 top-4">
          <BattleLog entries={snapshot.battleLog ?? []} />
        </div>

        <div className="absolute bottom-4 left-4">
          <PartyPanel party={party} activeId={activeId} />
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <ActionBar disabled={disabled} canSwap={snapshot.canSwap} onAction={handleAction} />
        </div>

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
    </>
  )
}

export default BattleHUD
