import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  GameStateSnapshot,
  PhaserGame,
  BattleEndedPayload,
  BattleActionName,
  PlayerActionPayload,
  UiSfxName,
} from '@/game';
import type { gameEventBus, GameEvent } from '@/game';
import GameToolbar from '@/components/game/GameToolbar';
import ExitModal from '@/components/game/ExitModal';
import ToastContainer, { toast } from '@/components/game/Toast';
import { useGameGuard } from '@/components/game/useGameGuard';
import { useCanvasRect } from '@/components/game/useCanvasRect';
import Button from '@/components/ui/Button';
import BattleHUD from '@/components/game/hud/BattleHUD';
import ExplorationHUD from '@/components/game/hud/ExplorationHUD';

type GameModule = {
  createGame: (parentId: string) => PhaserGame;
  gameEventBus: typeof gameEventBus;
  GameEvent: typeof GameEvent;
};

export default function GamePage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserGame | null>(null);
  const gameModuleRef = useRef<GameModule | null>(null);
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null);
  const gameStateRef = useRef<GameStateSnapshot | null>(null);
  const [battleOutcome, setBattleOutcome] = useState<BattleEndedPayload | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('af_audio_muted') === '1';
    } catch {
      return false;
    }
  });
  const eventBusCleanupRef = useRef<(() => void) | null>(null);

  const playUiSfx = useCallback((sound: UiSfxName = 'click') => {
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.UI_SFX, { sound });
  }, []);

  const handleSave = useCallback(() => {
    if (!gameModuleRef.current) return;
    playUiSfx('click');
    setSaving(true);
    gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.SAVE_GAME);
  }, [playUiSfx]);

  const autoSave = useCallback(() => {
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.SAVE_GAME);
  }, []);

  // During battles the server owns state writes — a client autosave would
  // clobber battle results with a stale snapshot.
  const canAutoSave = useCallback(() => gameStateRef.current?.currentScene !== 'battle', []);

  const handlePlayerAction = useCallback(
    (action: BattleActionName, payload?: PlayerActionPayload['payload']) => {
      playUiSfx('click');
      gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.PLAYER_ACTION, { action, payload });
    },
    [playUiSfx]
  );

  const handleBattleContinue = useCallback(() => {
    playUiSfx('confirm');
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.BATTLE_CONTINUE);
    setBattleOutcome(null);
  }, [playUiSfx]);

  const handleNavigate = useCallback(
    (roomId: string) => {
      playUiSfx('click');
      gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.NAVIGATE_ROOM, { roomId });
    },
    [playUiSfx]
  );

  const handleCollectTreasure = useCallback(() => {
    playUiSfx('confirm');
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.COLLECT_TREASURE);
  }, [playUiSfx]);

  const handleFleeEncounter = useCallback(() => {
    playUiSfx('cancel');
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.FLEE_ENCOUNTER);
  }, [playUiSfx]);

  const handleStartBattle = useCallback(() => {
    playUiSfx('confirm');
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.START_BATTLE);
  }, [playUiSfx]);

  const handlePartySwap = useCallback(
    (familiarId: string) => {
      playUiSfx('click');
      gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.PARTY_SWAP_REQUESTED, { familiarId });
    },
    [playUiSfx]
  );

  const handleToggleMute = useCallback(() => {
    setMuted((value) => !value);
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.TOGGLE_MUTE);
  }, []);

  const handleOpenExit = useCallback(() => {
    playUiSfx('click');
    setShowExitModal(true);
  }, [playUiSfx]);

  const cleanupGame = useCallback(() => {
    if (gameRef.current) {
      if (gameModuleRef.current) {
        gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED, {
          mode: 'battle',
          enabled: false,
        });
        gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED, {
          mode: 'exploration',
          enabled: false,
        });
        gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.EXIT_GAME);
      }
      gameRef.current.destroy(true);
      gameRef.current = null;
    }
    if (eventBusCleanupRef.current) {
      eventBusCleanupRef.current();
      eventBusCleanupRef.current = null;
    }
  }, []);

  const handleSaveAndExit = useCallback((): Promise<void> => {
    setSaving(true);

    return new Promise<void>((resolve) => {
      const mod = gameModuleRef.current;
      if (!mod) {
        cleanupGame();
        resolve();
        return;
      }

      let finished = false;

      const onSaveComplete = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);
        cleanupGame();
        resolve();
      };

      mod.gameEventBus.on(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);

      const timeoutId = setTimeout(() => {
        if (finished) return;
        finished = true;
        mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);
        cleanupGame();
        resolve();
      }, 5000);

      mod.gameEventBus.emit(mod.GameEvent.SAVE_GAME);
    });
  }, [cleanupGame]);

  const saveGame = useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const mod = gameModuleRef.current;
      if (!mod) {
        resolve(false);
        return;
      }

      let finished = false;

      const onSaveComplete = (result: { success: boolean }) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);
        resolve(result.success);
      };

      mod.gameEventBus.on(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);

      const timeoutId = setTimeout(() => {
        if (finished) return;
        finished = true;
        mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);
        resolve(false);
      }, 5000);

      mod.gameEventBus.emit(mod.GameEvent.SAVE_GAME);
    });
  }, []);

  const { handleBlockerProceed, handleBlockerReset, isBlockerActive } = useGameGuard({
    onAutoSave: autoSave,
    onShowExitModal: handleOpenExit,
    canAutoSave,
  });

  const canvasRect = useCanvasRect(containerRef, gameState);

  const handleCancelExit = useCallback(() => {
    playUiSfx('cancel');
    setShowExitModal(false);
    handleBlockerReset();
  }, [handleBlockerReset, playUiSfx]);

  // Modal handlers — check isBlockerActive to decide between resuming a blocked
  // navigation and exiting to the in-game world map.
  const handleSaveAndExitFromModal = useCallback(async () => {
    playUiSfx('confirm');
    if (isBlockerActive) {
      await handleSaveAndExit();
      handleBlockerProceed();
      return;
    }

    setSaving(true);
    await saveGame();
    setSaving(false);
    setShowExitModal(false);
    if (gameModuleRef.current) {
      gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.EXIT_GAME);
    } else {
      navigate('/play');
    }
  }, [isBlockerActive, handleSaveAndExit, handleBlockerProceed, saveGame, navigate, playUiSfx]);

  const handleExitWithoutSaveFromModal = useCallback(() => {
    playUiSfx('cancel');
    if (isBlockerActive) {
      handleBlockerProceed();
      return;
    }
    setShowExitModal(false);
    if (gameModuleRef.current) {
      gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.EXIT_GAME);
    } else {
      navigate('/play');
    }
  }, [isBlockerActive, handleBlockerProceed, navigate, playUiSfx]);

  // Mount Phaser game and subscribe to EventBus events
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const mod = await import('@arcane-familiars/game');
        if (cancelled) return;

        gameModuleRef.current = mod as unknown as GameModule;

        // Mount Phaser (guarded against StrictMode double-mount by gameRef check)
        if (containerRef.current && !gameRef.current) {
          gameRef.current = mod.createGame('game-container');
        }

        const onStateUpdate = (state: GameStateSnapshot) => {
          gameStateRef.current = state;
          setGameReady(true);
          setGameState(state);
        };
        const onSaveComplete = (result: { success: boolean }) => {
          setSaving(false);
          if (result.success) {
            toast.success('Game saved!');
          } else {
            toast.error('Save failed. Please try again.');
          }
        };
        const onBattleEnded = (outcome: BattleEndedPayload) => setBattleOutcome(outcome);
        const onSceneChanged = (payload: { scene: string; areaId?: string }) => {
          setGameReady(true);
          if (payload.scene !== 'battle') {
            setBattleOutcome(null);
          }
        };

        mod.gameEventBus.on(mod.GameEvent.STATE_UPDATED, onStateUpdate);
        mod.gameEventBus.on(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);
        mod.gameEventBus.on(mod.GameEvent.BATTLE_ENDED, onBattleEnded);
        mod.gameEventBus.on(mod.GameEvent.SCENE_CHANGED, onSceneChanged);

        eventBusCleanupRef.current = () => {
          mod.gameEventBus.off(mod.GameEvent.STATE_UPDATED, onStateUpdate);
          mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);
          mod.gameEventBus.off(mod.GameEvent.BATTLE_ENDED, onBattleEnded);
          mod.gameEventBus.off(mod.GameEvent.SCENE_CHANGED, onSceneChanged);
        };
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load game module:', error);
        setInitError('Failed to load the game. Please refresh the page to try again.');
      }
    }

    init();

    return () => {
      cancelled = true;
      cleanupGame();
    };
  }, []);

  useEffect(() => {
    if (!gameModuleRef.current || !gameState) return;

    const scene = gameState.currentScene;

    if (scene === 'battle') {
      gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED, {
        mode: 'battle',
        enabled: true,
      });
    } else {
      gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED, {
        mode: 'battle',
        enabled: false,
      });
    }

    if (scene === 'exploration') {
      gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED, {
        mode: 'exploration',
        enabled: true,
      });
    } else {
      gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED, {
        mode: 'exploration',
        enabled: false,
      });
    }
  }, [gameState?.currentScene]);

  const hud = gameState ? (
    <>
      <BattleHUD
        snapshot={gameState}
        outcome={battleOutcome}
        onAction={handlePlayerAction}
        onContinue={handleBattleContinue}
      />
      <ExplorationHUD
        snapshot={gameState}
        onNavigate={handleNavigate}
        onCollectTreasure={handleCollectTreasure}
        onFleeEncounter={handleFleeEncounter}
        onStartBattle={handleStartBattle}
        onSwapClick={handlePartySwap}
      />
    </>
  ) : null;

  return (
    <div className="relative flex-1 flex flex-col min-h-0 bg-[#0A0A0F]">
      <GameToolbar
        gameState={gameState}
        onSave={handleSave}
        onExit={handleOpenExit}
        onToggleMute={handleToggleMute}
        muted={muted}
        saving={saving}
      />

      <div ref={containerRef} id="game-container" className="flex-1 relative min-h-0 overflow-hidden">
        {!gameReady && !initError && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="rounded-md border border-border bg-surface-card/95 px-lg py-md shadow-card">
              <p className="animate-pulse font-body text-sm text-text-secondary">Loading game…</p>
            </div>
          </div>
        )}
        {gameState && (
          <div
            className="pointer-events-none absolute z-10"
            style={
              canvasRect
                ? {
                    left: canvasRect.left,
                    top: canvasRect.top,
                    width: canvasRect.width,
                    height: canvasRect.height,
                  }
                : { inset: 0 }
            }
          >
            {canvasRect ? (
              <div
                className="pointer-events-none absolute left-0 top-0 h-[600px] w-[800px] origin-top-left"
                style={{ transform: `scale(${canvasRect.width / 800})` }}
              >
                {hud}
              </div>
            ) : (
              hud
            )}
          </div>
        )}
      </div>

      {initError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="mx-md rounded-md bg-surface-card p-lg text-center shadow-card-hover">
            <p className="font-display text-lg font-semibold text-text-primary">Game failed to load</p>
            <p className="mt-sm text-sm text-text-muted">{initError}</p>
            <Button onClick={() => navigate('/play')} variant="primary" size="md" className="mt-md">
              Back to Home
            </Button>
          </div>
        </div>
      )}

      <ExitModal
        open={showExitModal}
        onSaveAndExit={handleSaveAndExitFromModal}
        onExitWithoutSave={handleExitWithoutSaveFromModal}
        onCancel={handleCancelExit}
        saving={saving}
      />

      <ToastContainer />
    </div>
  );
}
