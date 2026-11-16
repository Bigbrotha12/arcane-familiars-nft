import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type {
  GameStateSnapshot,
  PhaserGame,
  BattleEndedPayload,
  BattleActionName,
  PlayerActionPayload,
  UiSfxName,
  CharmsPayload,
  RunSummaryPayload,
} from '@/game';
import type { gameEventBus, GameEvent, BattleSpeed } from '@/game';
import GameToolbar from '@/components/game/GameToolbar';
import ExitModal from '@/components/game/ExitModal';
import CharmsModal from '@/components/game/hud/CharmsModal';
import RunSummaryModal from '@/components/game/hud/RunSummaryModal';
import ToastContainer, { toast } from '@/components/game/Toast';
import { useGameGuard } from '@/components/game/useGameGuard';
import { useCanvasRect } from '@/components/game/useCanvasRect';
import Button from '@/components/ui/Button';
import BattleHUD from '@/components/game/hud/BattleHUD';
import ExplorationHUD from '@/components/game/hud/ExplorationHUD';
import TipCard from '@/components/game/hud/TipCard';
import GuidedHintCard from '@/components/game/hud/GuidedHintCard';
import { useFirstTimeTips } from '@/components/game/hud/useFirstTimeTips';
import { useGuidedBattle } from '@/components/game/hud/useGuidedBattle';

interface PlayLayoutContext {
  signedIn: boolean;
  onAuthChange: (signedIn: boolean) => void;
}

type GameModule = {
  createGame: (parentId: string) => PhaserGame;
  gameEventBus: typeof gameEventBus;
  GameEvent: typeof GameEvent;
};

/** Shared with game/src/settings/battleSpeed.ts, which reads it on load. */
const BATTLE_SPEED_STORAGE_KEY = 'af_battle_speed';
const BATTLE_SPEED_ORDER: BattleSpeed[] = ['slow', 'medium', 'fast'];

export default function GamePage() {
  const navigate = useNavigate();
  // Guest state lives in the play layout so the toolbar can surface it outside
  // the canvas (it used to float over the bottom HUD and cover controls).
  const { signedIn, onAuthChange } = useOutletContext<PlayLayoutContext>();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserGame | null>(null);
  const gameModuleRef = useRef<GameModule | null>(null);
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null);
  const gameStateRef = useRef<GameStateSnapshot | null>(null);
  const [battleOutcome, setBattleOutcome] = useState<BattleEndedPayload | null>(null);
  const [charmsModal, setCharmsModal] = useState<CharmsPayload | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummaryPayload | null>(null);
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
  const [battleSpeed, setBattleSpeed] = useState<BattleSpeed>(() => {
    try {
      const stored = localStorage.getItem(BATTLE_SPEED_STORAGE_KEY);
      return stored === 'slow' || stored === 'medium' || stored === 'fast' ? stored : 'medium';
    } catch {
      return 'medium';
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

  const handleRecruitSwap = useCallback(
    (outId: string) => {
      const inId = battleOutcome?.rewards?.recruitedFamiliar;
      if (!inId) return;
      playUiSfx('confirm');
      gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.BATTLE_CONTINUE, {
        recruitSwap: { inId, outId },
      });
      setBattleOutcome(null);
    },
    [battleOutcome, playUiSfx]
  );

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

  const handleCurioChoice = useCallback(
    (optionId: string) => {
      playUiSfx('confirm');
      gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.CURIO_CHOICE, { optionId });
    },
    [playUiSfx]
  );

  const handleCurioLeave = useCallback(() => {
    playUiSfx('cancel');
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.CURIO_LEAVE);
  }, [playUiSfx]);

  const handleCurioContinue = useCallback(() => {
    playUiSfx('confirm');
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.CURIO_LEAVE);
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

  const handleCharmEquip = useCallback(
    (charmUid: string, familiarId: string | null) => {
      playUiSfx('confirm');
      gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.CHARM_EQUIP, {
        charmUid,
        familiarId,
      });
    },
    [playUiSfx]
  );

  const handleCharmSalvage = useCallback(
    (charmUid: string) => {
      playUiSfx('confirm');
      gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.CHARM_SALVAGE, { charmUid });
    },
    [playUiSfx]
  );

  const handleRunSummaryClose = useCallback(() => {
    playUiSfx('confirm');
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.RUN_SUMMARY_ACK);
    setRunSummary(null);
  }, [playUiSfx]);

  const handleCycleBattleSpeed = useCallback(() => {
    playUiSfx('click');
    const next = BATTLE_SPEED_ORDER[(BATTLE_SPEED_ORDER.indexOf(battleSpeed) + 1) % BATTLE_SPEED_ORDER.length];
    setBattleSpeed(next);
    try {
      localStorage.setItem(BATTLE_SPEED_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable; the game still gets the event below.
    }
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.SET_BATTLE_SPEED, { speed: next });
  }, [battleSpeed, playUiSfx]);

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
  const guide = useGuidedBattle(gameState);
  const tips = useFirstTimeTips(gameState, { paused: guide.running });
  // The canvas is letterboxed and centered, so the gap below it equals
  // canvasRect.top. On tall phones that gap fits a tip without covering the game.
  const tipBelowCanvas = Boolean(canvasRect && canvasRect.top >= 140);

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
        const onOpenCharms = (payload: CharmsPayload) => setCharmsModal(payload);
        const onShowRunSummary = (payload: RunSummaryPayload) => setRunSummary(payload);
        const onSceneChanged = (payload: { scene: string; areaId?: string }) => {
          setGameReady(true);
          if (payload.scene !== 'battle') {
            setBattleOutcome(null);
          }
          if (payload.scene !== 'world_map') {
            setCharmsModal(null);
            setRunSummary(null);
          }
        };

        mod.gameEventBus.on(mod.GameEvent.STATE_UPDATED, onStateUpdate);
        mod.gameEventBus.on(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);
        mod.gameEventBus.on(mod.GameEvent.BATTLE_ENDED, onBattleEnded);
        mod.gameEventBus.on(mod.GameEvent.SCENE_CHANGED, onSceneChanged);
        mod.gameEventBus.on(mod.GameEvent.OPEN_CHARMS, onOpenCharms);
        mod.gameEventBus.on(mod.GameEvent.SHOW_RUN_SUMMARY, onShowRunSummary);

        eventBusCleanupRef.current = () => {
          mod.gameEventBus.off(mod.GameEvent.STATE_UPDATED, onStateUpdate);
          mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete);
          mod.gameEventBus.off(mod.GameEvent.BATTLE_ENDED, onBattleEnded);
          mod.gameEventBus.off(mod.GameEvent.SCENE_CHANGED, onSceneChanged);
          mod.gameEventBus.off(mod.GameEvent.OPEN_CHARMS, onOpenCharms);
          mod.gameEventBus.off(mod.GameEvent.SHOW_RUN_SUMMARY, onShowRunSummary);
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

  // Signing in or out changes the account key. Reload once so every Phaser
  // scene and API request starts from the new save rather than the old guest
  // or account snapshot.
  useEffect(() => {
    const onAuthChanged = () => window.location.reload();
    window.addEventListener('af:auth-changed', onAuthChanged);
    return () => window.removeEventListener('af:auth-changed', onAuthChanged);
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
        guidedHighlight={guide.highlight}
        onAction={handlePlayerAction}
        onContinue={handleBattleContinue}
        onRecruitSwap={handleRecruitSwap}
      />
      <ExplorationHUD
        snapshot={gameState}
        onNavigate={handleNavigate}
        onCollectTreasure={handleCollectTreasure}
        onFleeEncounter={handleFleeEncounter}
        onStartBattle={handleStartBattle}
        onSwapClick={handlePartySwap}
        onCurioChoice={handleCurioChoice}
        onCurioLeave={handleCurioLeave}
        onCurioContinue={handleCurioContinue}
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
        battleSpeed={battleSpeed}
        onCycleBattleSpeed={handleCycleBattleSpeed}
        tipsEnabled={tips.enabled}
        onToggleTips={tips.toggleEnabled}
        saving={saving}
        signedIn={signedIn}
        onAuthChange={onAuthChange}
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
            {!tipBelowCanvas && (
              <>
                <TipCard
                  tip={tips.currentTip}
                  visible={tips.visible}
                  battle={gameState.currentScene === 'battle'}
                  onDismiss={tips.dismiss}
                  onDisable={() => tips.setEnabled(false)}
                />
                <GuidedHintCard
                  hint={guide.hint}
                  battle={gameState.currentScene === 'battle'}
                  onGotIt={guide.gotIt}
                  onSkip={guide.skip}
                />
              </>
            )}
          </div>
        )}
        {gameState && tipBelowCanvas && canvasRect && (
          <>
            <TipCard
              tip={tips.currentTip}
              visible={tips.visible}
              anchor={{
                top: canvasRect.top + canvasRect.height + 8,
                left: canvasRect.left + 12,
                width: Math.min(320, canvasRect.width - 24),
              }}
              onDismiss={tips.dismiss}
              onDisable={() => tips.setEnabled(false)}
            />
            <GuidedHintCard
              hint={guide.hint}
              anchor={{
                top: canvasRect.top + canvasRect.height + 8,
                left: canvasRect.left + 12,
                width: Math.min(320, canvasRect.width - 24),
              }}
              onGotIt={guide.gotIt}
              onSkip={guide.skip}
            />
          </>
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

      <CharmsModal
        open={charmsModal !== null}
        charms={charmsModal?.charms ?? []}
        familiars={charmsModal?.familiars ?? []}
        onEquip={handleCharmEquip}
        onSalvage={handleCharmSalvage}
        onClose={() => setCharmsModal(null)}
      />

      <RunSummaryModal open={runSummary !== null} payload={runSummary} onClose={handleRunSummaryClose} />

      <ToastContainer />
    </div>
  );
}
