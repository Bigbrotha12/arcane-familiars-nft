import Button from '@/components/ui/Button';
import AuthForm from '@/components/auth/AuthForm';
import type { GameStateSnapshot } from '@/game';

interface GameToolbarProps {
  gameState: GameStateSnapshot | null;
  onSave: () => void;
  onExit: () => void;
  onToggleMute: () => void;
  muted: boolean;
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
