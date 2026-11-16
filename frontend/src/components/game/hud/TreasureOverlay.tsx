// Treasure overlay: shows exactly what the chest holds (tier title, item icons,
// names, descriptions, rarity colours, coins) before Take/Leave. Center
// overlay; interactive.

import Button from '@/components/ui/Button';
import { RARITY_TEXT_CLASS } from './rarityStyles';
import type { GameStateSnapshot } from '@/game';

type TreasureView = NonNullable<GameStateSnapshot['treasure']>;

interface TreasureOverlayProps {
  treasure?: TreasureView;
  onTake: () => void;
  onLeave: () => void;
}

const TIER_TITLES: Record<TreasureView['tier'], string> = {
  common: 'A chest!',
  rare: 'A rare chest!',
  epic: 'An epic chest!',
};

function TreasureOverlay({ treasure, onTake, onLeave }: TreasureOverlayProps) {
  const items = treasure?.items ?? [];
  const currency = treasure?.currency ?? 0;

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="hud-frame w-full max-w-sm rounded-lg p-lg">
        <h2 className="mb-md font-display text-xl font-bold text-[#F0EFFF]">
          {TIER_TITLES[treasure?.tier ?? 'common']}
        </h2>

        {items.length > 0 && (
          <ul className="mb-md flex flex-col gap-2">
            {items.map((item, index) => (
              <li
                key={`${item.id}-${index}`}
                className="flex items-center gap-3 rounded-md border border-[#3B3870] bg-[#2D2A5E]/60 p-2"
              >
                {item.icon ? (
                  <img
                    src={`/assets/sprites/items/${item.icon}.png`}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-sm border border-[#E8E4F0] bg-white object-contain"
                  />
                ) : (
                  <span
                    className="h-9 w-9 shrink-0 rounded-sm border border-[#3B3870] bg-[#1E1B4B]"
                    aria-hidden="true"
                  />
                )}
                <div className="flex min-w-0 flex-col">
                  <span className={`font-display text-sm font-semibold ${RARITY_TEXT_CLASS[item.rarity]}`}>
                    {item.name}
                  </span>
                  {item.description && (
                    <span className="font-body text-xs leading-snug text-[#A5A3C4]">{item.description}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {currency > 0 && <p className="mb-md font-mono text-sm tabular-nums text-yellow">+{currency} coins</p>}

        <div className="flex gap-3">
          <Button variant="primary" size="md" onClick={onTake}>
            Take
          </Button>
          <Button variant="secondary" size="md" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </div>
    </div>
  );
}

export default TreasureOverlay;
