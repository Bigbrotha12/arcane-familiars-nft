// Modal list of inventory items usable in battle, with quantity counts.
// Selecting an item calls onSelect(itemId); zero-quantity entries are disabled.

import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { ItemOption } from '@/game'

interface ItemPanelProps {
  open: boolean
  items: ItemOption[]
  onSelect: (itemId: string) => void
  onClose: () => void
}

function ItemPanel({ open, items, onSelect, onClose }: ItemPanelProps) {
  return (
    <Modal open={open} onClose={onClose} title="Select Item" hud compact>
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="font-body text-xs text-text-muted">No items available.</p>
        )}
        {items.map((item) => {
          const usable = item.usable && item.quantity > 0
          return (
            <div key={item.id} className="flex flex-col gap-0.5">
              <Button
                variant={usable ? 'secondary' : 'ghost'}
                className="w-full px-2 py-1 text-xs"
                disabled={!usable}
                onClick={() => onSelect(item.id)}
              >
                {item.iconUrl && (
                  <img
                    src={item.iconUrl}
                    alt=""
                    className="mr-1.5 h-7 w-7 shrink-0 rounded-sm border border-[#E8E4F0] bg-white object-contain"
                  />
                )}
                <span className="flex-1 text-left font-body font-medium">{item.name}</span>
                <span className="font-mono text-[10px] tabular-nums text-text-secondary">
                  x{item.quantity}
                </span>
              </Button>
              <p className="px-1 text-xs text-text-muted">{item.description}</p>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

export default ItemPanel
