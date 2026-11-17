import Button from '@/components/ui/Button';
import Popover from '@/components/ui/Popover';
import LogoMark from '@/components/layout/LogoMark';
import AuthForm from '@/components/auth/AuthForm';
import type { BattleSpeed, GameStateSnapshot } from '@/game';

const SPEED_LABEL: Record<BattleSpeed, string> = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
const SPEED_ORDER: BattleSpeed[] = ['slow', 'medium', 'fast'];

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface GameToolbarProps {
  gameState: GameStateSnapshot | null;
  saveStatus: SaveStatus;
  onSave: () => void;
  onExit: () => void;
  onToggleMute: () => void;
  muted: boolean;
  battleSpeed: BattleSpeed;
  onSetBattleSpeed: (speed: BattleSpeed) => void;
  tipsEnabled: boolean;
  onToggleTips: () => void;
  onAuthChange: (signedIn: boolean) => void;
}

const SAVE_META: Record<SaveStatus, { text: string; icon: string; aria: string; tone: string }> = {
  idle: { text: 'Save', icon: '💾', aria: 'Save game', tone: 'text-text-secondary' },
  saving: { text: 'Saving…', icon: '💾', aria: 'Saving…', tone: 'text-text-secondary' },
  saved: { text: 'Saved ✓', icon: '✓', aria: 'Saved', tone: 'text-text-muted' },
  error: { text: 'Save failed · retry', icon: '⚠', aria: 'Save failed — retry', tone: 'text-warning' },
};

const MENU_ITEM_CLASS =
  'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left font-body text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** Natural scene names for snapshots that carry no area (world map, shops). */
const SCENE_LABEL: Record<string, string> = {
  world_map: 'World map',
  party_select: 'Party select',
  shop: 'Shop',
  dungeon_fail: 'Expedition over',
  battle: 'Battle',
};

function locationFor(gameState: GameStateSnapshot | null): { area: string; room?: string } {
  if (!gameState) return { area: 'World map' };
  if (gameState.areaName) return { area: gameState.areaName, room: gameState.roomName };
  return { area: SCENE_LABEL[gameState.currentScene] ?? 'World map' };
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
        on ? 'bg-accent' : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </span>
  );
}

export default function GameToolbar({
  gameState,
  saveStatus,
  onSave,
  onExit,
  onToggleMute,
  muted,
  battleSpeed,
  onSetBattleSpeed,
  tipsEnabled,
  onToggleTips,
  onAuthChange,
}: GameToolbarProps) {
  const location = locationFor(gameState);
  const save = SAVE_META[saveStatus];

  return (
    <div className="shrink-0 border-b border-border bg-surface-primary">
      <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 md:px-3">
        {/* Left — exit + brand */}
        <div className="flex min-w-0 items-center justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExit}
            aria-label="Exit game"
            title="Exit game"
            className="min-w-0 !gap-1 whitespace-nowrap !px-2"
          >
            <span aria-hidden="true">←</span>
            <LogoMark className="h-6 w-6" />
            <span className="hidden min-w-0 truncate md:inline-block">Arcane Familiars</span>
          </Button>
        </div>

        {/* Centre — current location */}
        <div className="flex min-w-0 items-center justify-center">
          <span className="max-w-[45vw] min-w-0 truncate whitespace-nowrap font-body text-sm font-medium text-text-primary">
            {location.area}
            {location.room && <span className="hidden text-text-secondary sm:inline"> · {location.room}</span>}
          </span>
        </div>

        {/* Right — save, settings, account */}
        <div className="flex min-w-0 items-center justify-end gap-1 whitespace-nowrap">
          <button
            type="button"
            onClick={onSave}
            disabled={saveStatus === 'saving'}
            aria-label={save.aria}
            title={save.aria}
            className={`inline-flex h-8 min-w-0 items-center justify-center rounded-full px-1.5 font-body text-sm font-medium transition-colors hover:bg-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${save.tone}`}
          >
            <span aria-hidden="true" className="sm:hidden">
              {save.icon}
            </span>
            <span className="hidden truncate sm:inline-block">{save.text}</span>
          </button>

          <Popover
            label="Settings"
            align="right"
            trigger={(triggerProps) => (
              <button
                {...triggerProps}
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-body text-base text-text-secondary transition-colors hover:bg-surface-alt hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span aria-hidden="true">⚙</span>
              </button>
            )}
          >
            <div role="group" aria-label="Battle speed" className="px-1.5 py-1">
              <span className="font-body text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Battle speed
              </span>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {SPEED_ORDER.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    role="menuitemradio"
                    aria-checked={battleSpeed === speed}
                    onClick={() => onSetBattleSpeed(speed)}
                    className={`rounded-sm px-1 py-1 font-body text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      battleSpeed === speed
                        ? 'bg-accent text-white'
                        : 'bg-surface-alt text-text-secondary hover:bg-accent-light'
                    }`}
                  >
                    {SPEED_LABEL[speed]}
                  </button>
                ))}
              </div>
            </div>

            <div role="separator" className="my-1 h-px bg-border" />

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={tipsEnabled}
              onClick={onToggleTips}
              className={MENU_ITEM_CLASS}
            >
              <span>Tips</span>
              <Switch on={tipsEnabled} />
            </button>

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={!muted}
              onClick={onToggleMute}
              className={MENU_ITEM_CLASS}
            >
              <span>Sound</span>
              <Switch on={!muted} />
            </button>

            <div role="separator" className="my-1 h-px bg-border" />

            <button type="button" role="menuitem" onClick={onSave} className={MENU_ITEM_CLASS}>
              Save now
            </button>
          </Popover>

          <AuthForm compact onAuthChange={onAuthChange} />
        </div>
      </div>
    </div>
  );
}
