// Battle HUD overlay for the embedded Phaser game. Composes combatant status
// cards (near the sprites), the arc party panel, battle log, action bar,
// ability/item modals, and outcome screen. Fully presentational: receives a
// GameStateSnapshot + BattleEndedPayload and emits callbacks — GamePage owns
// event-bus wiring (Step 6).

import { useEffect, useState } from 'react';
import { BALANCE } from '@arcane-familiars/game-logic';
import FamiliarStatusCompact from './FamiliarStatusCompact';
import CombinedControlsPanel from './CombinedControlsPanel';
import AbilityPanel from './AbilityPanel';
import ItemPanel from './ItemPanel';
import FamiliarsPanel from './FamiliarsPanel';
import BattleOutcome from './BattleOutcome';
import type { ActionBarItem } from './ActionBar';
import { matchupFor } from '@/components/game/affinity';
import type { GameStateSnapshot, BattleEndedPayload, BattleActionName, PlayerActionPayload } from '@/game';

interface BattleHUDProps {
  snapshot: GameStateSnapshot;
  outcome: BattleEndedPayload | null;
  onAction: (action: BattleActionName, payload?: PlayerActionPayload['payload']) => void;
  onContinue: () => void;
  onRecruitSwap?: (outId: string) => void;
}

type ActivePanel = 'ability' | 'item' | 'familiars' | null;

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

/** Party passive chips near the player status area. */
function PassiveChips({ passives }: { passives: NonNullable<GameStateSnapshot['passives']> }) {
  if (passives.length === 0) return null;

  return (
    <div className="flex max-w-[240px] flex-wrap justify-end gap-1">
      {passives.map((passive) => (
        <span
          key={passive.id}
          title={passive.description}
          className="pointer-events-auto rounded-full border border-teal/40 bg-[#1E1B4B]/85 px-2 py-0.5 font-body text-[10px] font-medium text-teal"
        >
          {passive.name} {ROMAN[passive.tier] ?? passive.tier}
        </span>
      ))}
    </div>
  );
}

function BattleHUD({ snapshot, outcome, onAction, onContinue, onRecruitSwap }: BattleHUDProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const sceneKey = snapshot.currentScene;
  const acting = snapshot.phase === 'acting';

  // A panel left open when the turn resolves (or when the battle ends) would
  // otherwise reappear on the next battle's first frame.
  useEffect(() => {
    setActivePanel(null);
  }, [sceneKey, acting]);

  if (snapshot.currentScene !== 'battle' || !snapshot.enemy || !snapshot.phase || snapshot.phase === 'connecting') {
    return null;
  }

  const enemy = snapshot.enemy;
  const disabled = snapshot.phase === 'acting' || outcome !== null;
  const party = snapshot.party ?? snapshot.familiars;
  const activeFamiliar = party[0] ?? snapshot.familiars[0];

  // Affinity matchup from the active familiar's point of view (drives the enemy
  // panel indicator and the ▲/▼ markers on damaging abilities).
  const matchup = matchupFor(activeFamiliar?.id, enemy.id);

  const handleAction = (action: BattleActionName) => {
    if (action === 'ability') setActivePanel('ability');
    else if (action === 'item') setActivePanel('item');
    else onAction(action);
  };

  const handleAbilitySelect = (abilityId: string) => {
    setActivePanel(null);
    onAction('ability', { abilityId });
  };

  const handleItemSelect = (itemId: string) => {
    setActivePanel(null);
    onAction('item', { itemId });
  };

  const handleFamiliarSelect = (familiarId: string) => {
    setActivePanel(null);
    onAction('swap', { targetId: familiarId });
  };

  const abilities = snapshot.abilities ?? [];
  const readyAbilities = abilities.filter((ability) => ability.usable).length;
  const guardMp = Math.round((activeFamiliar?.maxMp ?? 0) * BALANCE.guardMpRestore);
  const bagCount = (snapshot.items ?? []).reduce((total, item) => total + (item.quantity || 0), 0);

  const actions: ActionBarItem[] = [
    { key: 'attack', label: 'Attack', icon: '⚔️', primary: true, onClick: () => handleAction('attack') },
    {
      key: 'defend',
      label: 'Defend',
      icon: '🛡️',
      hint: '−50% dmg · +' + guardMp + ' MP',
      onClick: () => handleAction('defend'),
    },
    {
      key: 'ability',
      label: 'Ability',
      icon: '✨',
      hint: abilities.length ? `${readyAbilities}/${abilities.length} ready` : 'none learned',
      onClick: () => handleAction('ability'),
    },
    {
      key: 'item',
      label: 'Item',
      icon: '🎒',
      hint: `${bagCount} in bag`,
      onClick: () => handleAction('item'),
    },
    {
      key: 'swap',
      label: 'Swap',
      icon: '🔄',
      disabled: !snapshot.canSwap,
      disabledReason: 'needs 2+ familiars',
      hint: 'free · once a turn',
      onClick: () => handleAction('swap'),
    },
    { key: 'familiars', label: 'Familiars', icon: '🐾', onClick: () => setActivePanel('familiars') },
    {
      key: 'run',
      label: 'Run',
      icon: '🏃',
      // Fleeing a normal fight always works; the server refuses it against a boss.
      disabled: snapshot.isBoss === true,
      disabledReason: 'not from a boss',
      hint: 'always escapes',
      onClick: () => handleAction('run'),
    },
  ].map((action) => ({ ...action, disabled: disabled || action.disabled }));

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Enemy status card - top left corner */}
        {enemy && (
          <div className="absolute" style={{ left: '16px', top: '16px' }}>
            <FamiliarStatusCompact
              familiar={enemy}
              isBoss={snapshot.isBoss}
              statusEffects={enemy.statusEffects}
              matchup={matchup}
              charged={enemy.charged === true}
            />
          </div>
        )}

        {/* Player status card - right corner, above action bar */}
        {activeFamiliar && (
          <div className="absolute flex flex-col items-end gap-1" style={{ right: '16px', bottom: '250px' }}>
            <PassiveChips passives={snapshot.passives ?? []} />
            <FamiliarStatusCompact familiar={activeFamiliar} statusEffects={activeFamiliar.statusEffects} />
          </div>
        )}

        {/* Combined bottom panel */}
        <CombinedControlsPanel
          actions={actions}
          logEntries={snapshot.battleLog ?? []}
          party={party}
          activeId={activeFamiliar?.id}
        />

        {outcome && (
          <BattleOutcome outcome={outcome} party={party} onContinue={onContinue} onRecruitSwap={onRecruitSwap} />
        )}
      </div>

      <AbilityPanel
        open={activePanel === 'ability'}
        abilities={abilities}
        matchup={matchup}
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
  );
}

export default BattleHUD;
