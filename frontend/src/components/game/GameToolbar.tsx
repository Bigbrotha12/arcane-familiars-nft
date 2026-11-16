import Button from '@/components/ui/Button';
import AuthForm from '@/components/auth/AuthForm';
import type { BattleSpeed, GameStateSnapshot } from '@/game';

const SPEED_LABEL: Record<BattleSpeed, string> = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
const SPEED_SHORT: Record<BattleSpeed, string> = { slow: '1×', medium: '2×', fast: '3×' };

interface GameToolbarProps {
  gameState: GameStateSnapshot | null;
  onSave: () => void;
  onExit: () => void;
  onToggleMute: () => void;
  muted: boolean;
  battleSpeed: BattleSpeed;
  onCycleBattleSpeed: () => void;
  tipsEnabled: boolean;
  onToggleTips: () => void;
  saving: boolean;
  signedIn: boolean;
  onAuthChange: (signedIn: boolean) => void;
}

export default function GameToolbar({
  gameState,
  onSave,
  onExit,
  onToggleMute,
  muted,
  battleSpeed,
  onCycleBattleSpeed,
  tipsEnabled,
  onToggleTips,
  saving,
  signedIn,
  onAuthChange,
}: GameToolbarProps) {
  return (
    <div className="shrink-0 bg-surface-primary border-b border-border">
      <div className="max-w-content mx-auto flex items-center justify-between gap-2 px-3 py-2 md:px-lg">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Exit
        </Button>

        <div className="hidden min-w-0 items-center gap-3 md:flex">
          <span className="truncate font-display text-sm font-semibold text-text-primary">Arcane Familiars</span>
          {gameState?.areaName && (
            <>
              <span className="text-text-muted">·</span>
              <span className="truncate font-body text-xs text-text-secondary">{gameState.areaName}</span>
            </>
          )}
          {gameState?.roomName && (
            <>
              <span className="text-text-muted hidden lg:inline">·</span>
              <span className="font-mono text-xs text-text-muted tabular-nums hidden lg:inline">
                {gameState.roomName}
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!signedIn && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-alt px-2 py-1 font-body text-[11px] font-medium text-text-secondary">
              <span aria-hidden="true">👤</span>
              <span className="hidden lg:inline">Guest — progress saved in this browser</span>
              <span className="lg:hidden">Guest</span>
            </span>
          )}

          <AuthForm compact onAuthChange={onAuthChange} />

          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />

          <Button
            variant="ghost"
            size="sm"
            onClick={onCycleBattleSpeed}
            aria-label={`Battle speed: ${SPEED_LABEL[battleSpeed]}. Click to change.`}
            title={`Battle speed: ${SPEED_LABEL[battleSpeed]} (click to change)`}
          >
            <span aria-hidden="true">⏱</span>
            <span className="ml-1 hidden sm:inline">{SPEED_LABEL[battleSpeed]}</span>
            <span className="ml-1 font-mono tabular-nums sm:hidden">{SPEED_SHORT[battleSpeed]}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleTips}
            aria-pressed={tipsEnabled}
            aria-label={tipsEnabled ? 'Tips on. Click to turn off.' : 'Tips off. Click to turn on.'}
            title={tipsEnabled ? 'Tips are on (click to turn off)' : 'Tips are off (click to turn on)'}
          >
            <span aria-hidden="true" className={tipsEnabled ? '' : 'opacity-40 grayscale'}>
              💡
            </span>
            <span className="ml-1 hidden xl:inline">{tipsEnabled ? 'Tips on' : 'Tips off'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
            title={muted ? 'Unmute game audio' : 'Mute game audio'}
          >
            {muted ? '🔇' : '🔊'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onSave} disabled={saving}>
            {saving ? 'Saving...' : '💾 Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
