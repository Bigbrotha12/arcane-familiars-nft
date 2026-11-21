// World-map bottom dock: currency / battle chips on the left and the four
// secondary destinations on the right. Replaces the Phaser text links that used
// to overlap the stats bar. Actions are forwarded to WorldMapScene so the shop,
// charm modal and Daily Expedition behave exactly as before. The Team modal is
// owned by GamePage so it renders outside the scaled HUD layer.

import Button from '@/components/ui/Button';
import type { GameStateSnapshot, WorldAction } from '@/game';

interface WorldMapHUDProps {
  snapshot: GameStateSnapshot;
  onAction: (action: WorldAction) => void;
  onOpenTeam: () => void;
}

// Same design-space enlargement as ActionBar: on a phone canvas the whole HUD
// renders at roughly half size, so 22px design text lands near 11px on screen.
const DOCK_BUTTON =
  'shrink-0 whitespace-nowrap !px-2 !py-0.5 text-xs max-sm:!px-2 max-sm:!py-1.5 max-sm:text-[22px] max-sm:!leading-tight';

function WorldMapHUD({ snapshot, onAction, onOpenTeam }: WorldMapHUDProps) {
  const daily = snapshot.worldDaily ?? null;
  const dailyLabel = !daily ? '☀ Daily' : daily.cleared ? '☀ Daily ✓' : `☀ Daily · ${daily.areaName}`;

  return (
    <>
      {/* 760 design px wide (left/right 20), 44 high, 8 above the bottom edge.
          On phones the chips stack above the buttons, growing to ~76px; the
          card grid ends at y=486 and the message line sits at y=499. */}
      <div className="pointer-events-auto absolute bottom-2 left-5 right-5 z-10">
        <div className="hud-frame flex h-11 items-center justify-between gap-2 rounded-md px-3 max-sm:h-auto max-sm:flex-col max-sm:items-stretch max-sm:gap-1 max-sm:px-2 max-sm:py-1">
          <div className="flex items-center gap-3 font-mono text-xs tabular-nums max-sm:w-full max-sm:justify-between max-sm:gap-2 max-sm:text-[18px] max-sm:leading-tight">
            <span className="text-[#FBBF24]">🪙 {snapshot.currency}</span>
            <span className="text-[#B8B5E0]">
              ⚔ {snapshot.wins} wins · {snapshot.battleCount} battles
            </span>
          </div>

          <div className="flex items-center gap-1.5 max-sm:flex-wrap max-sm:gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onAction('daily')}
              className={`${DOCK_BUTTON} ${daily?.cleared ? '!bg-[#2D2A5E] !text-[#A5A3C4] hover:!bg-[#3B3870]' : ''}`}
            >
              {dailyLabel}
            </Button>
            <Button size="sm" variant="secondary" onClick={onOpenTeam} className={DOCK_BUTTON}>
              🐾 Team
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAction('charms')} className={DOCK_BUTTON}>
              ◆ Charms
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAction('shop')} className={DOCK_BUTTON}>
              🛒 Shop
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export default WorldMapHUD;
export { WorldMapHUD };
