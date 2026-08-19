// Modal list of the active familiar's abilities with MP costs. Selecting an
// ability calls onSelect(abilityId); entries with insufficient MP are disabled.

import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { AbilityOption } from '@/game'

interface AbilityPanelProps {
  open: boolean
  abilities: AbilityOption[]
  onSelect: (abilityId: string) => void
  onClose: () => void
}

function AbilityPanel({ open, abilities, onSelect, onClose }: AbilityPanelProps) {
  return (
    <Modal open={open} onClose={onClose} title="Select Ability" hud>
      <div className="flex flex-col gap-3">
        {abilities.length === 0 && (
          <p className="font-body text-sm text-text-muted">No abilities available.</p>
        )}
        {abilities.map((ability) => (
          <div key={ability.id} className="flex flex-col gap-1">
            <Button
              variant={ability.usable ? 'secondary' : 'ghost'}
              className="w-full"
              disabled={!ability.usable}
              onClick={() => onSelect(ability.id)}
            >
              <span className="flex-1 text-left font-body font-medium">{ability.name}</span>
              <span className="font-mono text-xs tabular-nums text-teal">MP: {ability.mpCost}</span>
            </Button>
            <p className="px-2 text-sm text-text-muted">{ability.description}</p>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export default AbilityPanel
