// Modal list of the party's familiars. Selecting a non-active familiar calls
// onSelect(familiarId) so the player can swap it into the active slot.

import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { FamiliarState } from '@/game'

interface FamiliarsPanelProps {
  open: boolean
  party: FamiliarState[]
  activeId?: string
  onSelect: (familiarId: string) => void
  onClose: () => void
}

function FamiliarsPanel({ open, party, activeId, onSelect, onClose }: FamiliarsPanelProps) {
  return (
    <Modal open={open} onClose={onClose} title="Select Familiar" hud>
      <div className="flex flex-col gap-3">
        {party.length === 0 && (
          <p className="font-body text-sm text-text-muted">No familiars in your party.</p>
        )}
        {party.map((familiar) => {
          const isActive = familiar.id === activeId
          const isFainted = familiar.hp <= 0
          const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0
          return (
            <div key={familiar.id} className="flex flex-col gap-1">
              <Button
                variant={isActive ? 'primary' : 'secondary'}
                className="w-full"
                disabled={isActive || isFainted}
                onClick={() => onSelect(familiar.id)}
              >
                <span className="flex-1 text-left font-body font-medium">{familiar.name}</span>
                <span className="font-mono text-xs tabular-nums">
                  <span className="text-teal">HP {Math.max(0, Math.floor(familiar.hp))}/{familiar.maxHp}</span>
                  <span className="ml-2 text-accent">MP {Math.max(0, Math.floor(familiar.mp))}/{familiar.maxMp}</span>
                </span>
              </Button>
              {isActive && (
                <p className="px-2 text-sm text-text-muted">Currently in battle</p>
              )}
              {isFainted && !isActive && (
                <p className="px-2 text-sm text-text-muted">Fainted</p>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

export default FamiliarsPanel