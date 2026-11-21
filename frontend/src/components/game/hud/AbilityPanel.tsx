// Modal list of the active familiar's abilities. Each row shows the MP cost,
// the remaining cooldown, and — for damaging abilities — a ▲/▼ marker when the
// affinity matchup actually matters. Entries that cannot be used say why.

import { EffectType, getAbility } from '@arcane-familiars/game-logic';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { Matchup } from '@/components/game/affinity';
import type { AbilityOption } from '@/game';

interface AbilityPanelProps {
  open: boolean;
  abilities: AbilityOption[];
  /** Active familiar vs enemy matchup, for the ▲/▼ damage markers. */
  matchup?: Matchup;
  onSelect: (abilityId: string) => void;
  onClose: () => void;
}

function AbilityPanel({ open, abilities, matchup = 'neutral', onSelect, onClose }: AbilityPanelProps) {
  return (
    <Modal open={open} onClose={onClose} title="Select Ability" hud compact>
      <div className="flex flex-col gap-2">
        {abilities.length === 0 && <p className="font-body text-xs text-text-muted">No abilities available.</p>}
        {abilities.map((ability) => {
          const detail = getAbility(ability.id);
          const damaging = detail?.effectType === EffectType.Damage;
          const marker = damaging && matchup !== 'neutral' ? (matchup === 'strong' ? '▲' : '▼') : null;
          const onCooldown = (ability.cooldown ?? 0) > 0;

          return (
            <div key={ability.id} className="flex flex-col gap-0.5">
              <Button
                variant={ability.usable ? 'secondary' : 'ghost'}
                className="w-full px-2 py-1 text-xs"
                disabled={!ability.usable}
                onClick={() => onSelect(ability.id)}
              >
                <span className="flex flex-1 items-center gap-1 text-left font-body font-medium">
                  {ability.name}
                  {marker && (
                    <span
                      aria-label={matchup === 'strong' ? 'strong against this enemy' : 'weak against this enemy'}
                      className={`text-[10px] ${matchup === 'strong' ? 'text-teal' : 'text-error'}`}
                    >
                      {marker}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
                  {onCooldown ? (
                    <span className="text-warning">CD {ability.cooldown}</span>
                  ) : (
                    <span className="text-teal">MP {ability.mpCost}</span>
                  )}
                  {onCooldown && <span className="text-teal">MP {ability.mpCost}</span>}
                </span>
              </Button>
              <p className="px-1 text-xs text-text-muted">
                {ability.description}
                {ability.disabledReason ? (
                  <span className="font-mono text-[10px] text-warning"> — {ability.disabledReason}</span>
                ) : null}
              </p>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default AbilityPanel;
