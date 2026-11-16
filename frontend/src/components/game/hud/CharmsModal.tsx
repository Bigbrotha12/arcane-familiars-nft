// Charm management on the world map: what each familiar wears on top, then the
// owned charm list with equip/salvage actions. Rarity colours and the ◆ glyph
// follow DESIGN.md; no charm art exists.

import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { RARITY_TEXT_CLASS } from './rarityStyles';
import {
  CHARM_SALVAGE,
  MAX_CHARMS,
  charmModsLabel,
  charmName,
  type CharmInstance,
  type CharmRarity,
} from '@arcane-familiars/game-logic';
import type { CharmFamiliar } from '@/game';

const RARITY_ORDER: Record<CharmRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
};

interface CharmsModalProps {
  open: boolean;
  charms: CharmInstance[];
  familiars: CharmFamiliar[];
  onEquip: (charmUid: string, familiarId: string | null) => void;
  onSalvage: (charmUid: string) => void;
  onClose: () => void;
}

function CharmsModal({ open, charms, familiars, onEquip, onSalvage, onClose }: CharmsModalProps) {
  const sorted = [...charms].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);

  return (
    <Modal open={open} onClose={onClose} title="Charms" hud>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        <p className="font-mono text-xs tabular-nums text-[#A5A3C4]">
          {charms.length}/{MAX_CHARMS} charms
        </p>

        <section className="flex flex-col gap-2">
          <h3 className="font-display text-sm font-semibold text-[#F0EFFF]">Worn by familiars</h3>
          {familiars.length === 0 && <p className="font-body text-sm text-[#A5A3C4]">No familiars owned.</p>}
          {familiars.map((familiar) => {
            const worn = charms.find((charm) => charm.equippedTo === familiar.id);
            return (
              <div
                key={familiar.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[#3B3870] bg-[#2D2A5E]/60 p-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-body text-sm font-medium text-[#F0EFFF]">{familiar.name}</span>
                  {worn ? (
                    <span className={`font-body text-xs ${RARITY_TEXT_CLASS[worn.rarity]}`}>◆ {charmName(worn)}</span>
                  ) : (
                    <span className="font-body text-xs text-[#A5A3C4]">No charm</span>
                  )}
                </div>
                {worn && (
                  <Button variant="secondary" size="sm" onClick={() => onEquip(worn.uid, null)}>
                    Unequip
                  </Button>
                )}
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-display text-sm font-semibold text-[#F0EFFF]">Your charms</h3>
          {charms.length === 0 && (
            <p className="font-body text-sm text-[#A5A3C4]">No charms yet. Chests in dungeons can hold them.</p>
          )}
          {sorted.map((charm) => {
            const owner = familiars.find((familiar) => familiar.id === charm.equippedTo);
            return (
              <div
                key={charm.uid}
                className="flex flex-col gap-1.5 rounded-md border border-[#3B3870] bg-[#2D2A5E]/60 p-2"
              >
                <div className="flex flex-col">
                  <span className={`font-display text-sm font-semibold ${RARITY_TEXT_CLASS[charm.rarity]}`}>
                    ◆ {charmName(charm)}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[#A5A3C4]">{charmModsLabel(charm)}</span>
                </div>
                {owner && <p className="font-body text-xs text-[#B8B5E0]">Worn by {owner.name}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 font-body text-xs text-[#A5A3C4]">
                    <span>Equip on…</span>
                    <select
                      value={charm.equippedTo ?? ''}
                      onChange={(event) => onEquip(charm.uid, event.target.value || null)}
                      className="rounded-sm border border-[#3B3870] bg-[#1E1B4B] px-2 py-1 font-body text-xs text-[#F0EFFF]"
                    >
                      <option value="">Not equipped</option>
                      {familiars.map((familiar) => (
                        <option key={familiar.id} value={familiar.id}>
                          {familiar.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={Boolean(charm.equippedTo)}
                    onClick={() => onSalvage(charm.uid)}
                  >
                    Salvage (+{CHARM_SALVAGE[charm.rarity]} coins)
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </Modal>
  );
}

export default CharmsModal;
