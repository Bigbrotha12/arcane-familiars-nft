// Field item picker for exploration. Lists every field-usable item with its
// combined run-loot + bank count, then asks which party familiar receives a
// heal. Revive items apply to the whole party immediately.

import { useEffect, useState } from 'react';
import { computeItemHeal, getItem } from '@arcane-familiars/game-logic';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { FamiliarState, FieldItemSnapshot } from '@/game';

interface FieldItemPanelProps {
  open: boolean;
  items: FieldItemSnapshot[];
  party: FamiliarState[];
  onUse: (itemId: string, familiarId?: string) => void;
  onClose: () => void;
}

function targetState(itemId: string, familiar: FamiliarState): { disabled: boolean; reason?: string } {
  if (familiar.hp <= 0) return { disabled: true, reason: 'Fainted' };

  const item = getItem(itemId);
  if (!item) return { disabled: true, reason: 'Unknown item' };

  const heal = computeItemHeal(
    item.effects,
    { hp: familiar.hp, mp: familiar.mp },
    { hp: familiar.maxHp, mp: familiar.maxMp }
  );
  if (heal.hp <= 0 && heal.mp <= 0) {
    const healsHp = item.effects.some((effect) => effect.kind === 'heal_hp' || effect.kind === 'heal_percentage');
    const healsMp = item.effects.some((effect) => effect.kind === 'heal_mp');
    const reason = healsHp && healsMp ? 'Already at full HP/MP' : healsMp ? 'Already at full MP' : 'Already at full HP';
    return { disabled: true, reason };
  }

  return { disabled: false };
}

function FieldItemPanel({ open, items, party, onUse, onClose }: FieldItemPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reopening the panel always starts from the item list, and a closed panel
  // forgets any half-finished target choice.
  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  const selected = selectedId ? getItem(selectedId) : undefined;
  const selectedItem = selectedId ? items.find((item) => item.id === selectedId) : undefined;

  const handleItemSelect = (itemId: string) => {
    const item = getItem(itemId);
    if (!item) return;
    if (item.effects.some((effect) => effect.kind === 'revive_party')) {
      onUse(itemId);
      setSelectedId(null);
      return;
    }
    setSelectedId(itemId);
  };

  const handleTargetSelect = (familiarId: string) => {
    if (!selectedId) return;
    onUse(selectedId, familiarId);
    setSelectedId(null);
  };

  return (
    <Modal open={open} onClose={onClose} title={selected ? `Use ${selected.name}` : 'Items'} hud compact>
      {selected ? (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-xs text-[#B8B5E0]">{selectedItem?.description}</p>
          {party.length === 0 && <p className="font-body text-xs text-[#A5A3C4]">No familiars in your party.</p>}
          {party.map((familiar) => {
            const state = targetState(selected.id, familiar);
            return (
              <div key={familiar.id} className="flex flex-col gap-0.5">
                <Button
                  variant={state.disabled ? 'ghost' : 'secondary'}
                  className="w-full px-2 py-1 text-xs"
                  disabled={state.disabled}
                  onClick={() => handleTargetSelect(familiar.id)}
                >
                  <span className="flex-1 text-left font-body font-medium">{familiar.name}</span>
                  <span className="font-mono text-[10px] tabular-nums">
                    <span className="text-teal">
                      HP {Math.max(0, Math.floor(familiar.hp))}/{familiar.maxHp}
                    </span>
                    <span className="ml-2 text-accent">
                      MP {Math.max(0, Math.floor(familiar.mp))}/{familiar.maxMp}
                    </span>
                  </span>
                </Button>
                {state.reason && <p className="px-1 text-[10px] text-warning">{state.reason}</p>}
              </div>
            );
          })}
          <Button variant="ghost" className="mt-1 w-full px-2 py-1 text-xs" onClick={() => setSelectedId(null)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.length === 0 && <p className="font-body text-xs text-[#A5A3C4]">No usable items.</p>}
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-0.5">
              <Button
                variant="secondary"
                className="w-full px-2 py-1 text-xs"
                onClick={() => handleItemSelect(item.id)}
              >
                {item.icon && (
                  <img
                    src={`/assets/sprites/items/${item.icon}.png`}
                    alt=""
                    className="mr-1.5 h-7 w-7 shrink-0 rounded-sm border border-[#E8E4F0] bg-white object-contain max-sm:h-12 max-sm:w-12 max-sm:mr-2.5"
                  />
                )}
                <span className="flex-1 text-left font-body font-medium">{item.name}</span>
                <span className="font-mono text-[10px] tabular-nums text-[#B8B5E0]">x{item.quantity}</span>
              </Button>
              <p className="px-1 text-xs text-[#A5A3C4]">{item.description}</p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default FieldItemPanel;
export { FieldItemPanel };
