import Button from '@/components/ui/Button';
import type { GameStateSnapshot } from '@/game';

interface GameToolbarProps {
  gameState: GameStateSnapshot | null;
  onSave: () => void;
  onExit: () => void;
  saving: boolean;
}

export default function GameToolbar({ gameState, onSave, onExit, saving }: GameToolbarProps) {
  return (
    <div className="shrink-0 bg-surface-primary border-b border-border">
      <div className="max-w-content mx-auto flex items-center justify-between px-lg py-2">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Exit
        </Button>

        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-semibold text-text-primary">Arcane Familiars</span>
          {gameState?.areaName && (
            <>
              <span className="text-text-muted">·</span>
              <span className="font-body text-xs text-text-secondary">{gameState.areaName}</span>
            </>
          )}
          {gameState?.roomName && (
            <>
              <span className="text-text-muted hidden sm:inline">·</span>
              <span className="font-mono text-xs text-text-muted tabular-nums hidden sm:inline">
                {gameState.roomName}
              </span>
            </>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : '💾 Save'}
        </Button>
      </div>
    </div>
  );
}
