// Preview design for the combined bottom control panel:
// Row 1: action bar (full width).
// Row 2: two columns — left 75% = log box, right 25% = party panel.
// Uses the real ActionBar / BattleLog / CircularArcPartyPanel components so the
// review is faithful to what gets implemented.

import type { FamiliarState } from '@/game'
import ActionBar, { type ActionBarItem } from './ActionBar'
import BattleLog from './BattleLog'
import CircularArcPartyPanel from './CircularArcPartyPanel'

const previewParty: FamiliarState[] = [
  {
    id: 'whiteDog',
    name: 'Lumina',
    hp: 45,
    maxHp: 60,
    mp: 12,
    maxMp: 25,
    attack: 18,
    defense: 12,
    speed: 15,
    arcane: 20,
    affinity: 'light',
  },
  {
    id: 'fireFox',
    name: 'Ember',
    hp: 28,
    maxHp: 40,
    mp: 18,
    maxMp: 20,
    attack: 15,
    defense: 10,
    speed: 18,
    arcane: 22,
    affinity: 'fire',
  },
]

const previewActions: ActionBarItem[] = [
  { key: 'attack', label: 'Attack', primary: true, onClick: () => {} },
  { key: 'defend', label: 'Defend', onClick: () => {} },
  { key: 'ability', label: 'Ability', onClick: () => {} },
  { key: 'item', label: 'Item', onClick: () => {} },
  { key: 'swap', label: 'Swap', onClick: () => {} },
  { key: 'run', label: 'Run', onClick: () => {} },
]

const previewLog = [
  'Lumina attacked the shadow cat for 12 damage!',
]

function CombinedControlsPreview() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="mb-4 font-display text-lg font-medium text-[#B8B5E0]">
          Combined Bottom Panel (Action Bar + Log + Party)
        </h2>
        <p className="mb-4 text-sm text-[#A5A3C4]">
          Row 1: action bar full width. Row 2: log box 75% / party panel 25%.
        </p>

        {/* The combined parent component under review */}
        <div className="mx-auto w-full max-w-2xl">
          <div className="flex flex-col gap-1.5">
            {/* Row 1 — action bar */}
            <ActionBar items={previewActions} />

            {/* Row 2 — log (75%) + party (25%) */}
            <div className="hud-frame flex min-h-[200px] rounded-md">
              <div className="flex w-3/4 flex-col p-md">
                <div className="flex flex-1 flex-col [&>div]:flex-1">
                  <BattleLog entries={previewLog} />
                </div>
              </div>
              <div className="relative w-1/4">
                {/* Partial vertical separator */}
                <div className="absolute top-4 bottom-4 left-0 border-l-2 border-[#A78BFA]" />
                <div className="flex h-full items-center justify-center">
                  <CircularArcPartyPanel party={previewParty} activeId="whiteDog" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default CombinedControlsPreview