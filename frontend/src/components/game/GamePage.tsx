import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  GameStateSnapshot,
  PhaserGame,
  BattleEndedPayload,
  BattleActionName,
  PlayerActionPayload,
  ExploreDirection,
} from '@/game'
import type { gameEventBus, GameEvent } from '@/game'
import GameToolbar from '@/components/game/GameToolbar'
import ExitModal from '@/components/game/ExitModal'
import ToastContainer, { toast } from '@/components/game/Toast'
import { useGameGuard } from '@/components/game/useGameGuard'
import { useCanvasRect } from '@/components/game/useCanvasRect'
import Button from '@/components/ui/Button'
import BattleHUD from '@/components/game/hud/BattleHUD'
import ExplorationHUD from '@/components/game/hud/ExplorationHUD'

type GameModule = {
  createGame: (parentId: string) => PhaserGame
  gameEventBus: typeof gameEventBus
  GameEvent: typeof GameEvent
}

export default function GamePage() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<PhaserGame | null>(null)
  const gameModuleRef = useRef<GameModule | null>(null)
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null)
  const [battleOutcome, setBattleOutcome] = useState<BattleEndedPayload | null>(null)
  const [showExitModal, setShowExitModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const eventBusCleanupRef = useRef<(() => void) | null>(null)

  const handleSave = useCallback(() => {
    if (!gameModuleRef.current) return
    setSaving(true)
    gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.SAVE_GAME)
  }, [])

  const autoSave = useCallback(() => {
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.SAVE_GAME)
  }, [])

  const handlePlayerAction = useCallback(
    (action: BattleActionName, payload?: PlayerActionPayload['payload']) => {
      gameModuleRef.current?.gameEventBus.emit(
        gameModuleRef.current.GameEvent.PLAYER_ACTION,
        { action, payload }
      )
    },
    []
  )

  const handleBattleContinue = useCallback(() => {
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.BATTLE_CONTINUE)
    setBattleOutcome(null)
  }, [])

  const handleNavigate = useCallback((direction: ExploreDirection) => {
    gameModuleRef.current?.gameEventBus.emit(
      gameModuleRef.current.GameEvent.NAVIGATE_ROOM,
      { direction }
    )
  }, [])

  const handleCollectTreasure = useCallback(() => {
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.COLLECT_TREASURE)
  }, [])

  const handleFleeEncounter = useCallback(() => {
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.FLEE_ENCOUNTER)
  }, [])

  const handleStartBattle = useCallback(() => {
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.START_BATTLE)
  }, [])

  const cleanupGame = useCallback(() => {
    if (gameRef.current) {
      if (gameModuleRef.current) {
        gameModuleRef.current.gameEventBus.emit(
          gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED,
          { mode: 'battle', enabled: false }
        )
        gameModuleRef.current.gameEventBus.emit(
          gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED,
          { mode: 'exploration', enabled: false }
        )
        gameModuleRef.current.gameEventBus.emit(gameModuleRef.current.GameEvent.EXIT_GAME)
      }
      gameRef.current.destroy(true)
      gameRef.current = null
    }
    if (eventBusCleanupRef.current) {
      eventBusCleanupRef.current()
      eventBusCleanupRef.current = null
    }
  }, [])

  const handleSaveAndExit = useCallback((): Promise<void> => {
    setSaving(true)

    return new Promise<void>((resolve) => {
      const mod = gameModuleRef.current
      if (!mod) {
        cleanupGame()
        resolve()
        return
      }

      let finished = false

      const onSaveComplete = () => {
        if (finished) return
        finished = true
        clearTimeout(timeoutId)
        mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete)
        cleanupGame()
        resolve()
      }

      mod.gameEventBus.on(mod.GameEvent.SAVE_COMPLETE, onSaveComplete)

      const timeoutId = setTimeout(() => {
        if (finished) return
        finished = true
        mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete)
        cleanupGame()
        resolve()
      }, 5000)

      mod.gameEventBus.emit(mod.GameEvent.SAVE_GAME)
    })
  }, [cleanupGame])

  const { handleBlockerProceed, handleBlockerReset, isBlockerActive } = useGameGuard({
    onAutoSave: autoSave,
    onShowExitModal: () => setShowExitModal(true),
  })

  const canvasRect = useCanvasRect(containerRef, gameState)

  const handleCancelExit = useCallback(() => {
    setShowExitModal(false)
    handleBlockerReset()
  }, [handleBlockerReset])

  // Modal handlers — check isBlockerActive to decide navigation method
  const handleSaveAndExitFromModal = useCallback(async () => {
    await handleSaveAndExit()
    if (isBlockerActive) {
      handleBlockerProceed()
    } else {
      navigate('/play')
    }
  }, [handleSaveAndExit, isBlockerActive, handleBlockerProceed, navigate])

  const handleExitWithoutSaveFromModal = useCallback(() => {
    cleanupGame()
    if (isBlockerActive) {
      handleBlockerProceed()
    } else {
      navigate('/play')
    }
  }, [cleanupGame, isBlockerActive, handleBlockerProceed, navigate])

  // Mount Phaser game and subscribe to EventBus events
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const mod = await import('@arcane-familiars/game')
        if (cancelled) return

        gameModuleRef.current = mod as unknown as GameModule

        // Mount Phaser (guarded against StrictMode double-mount by gameRef check)
        if (containerRef.current && !gameRef.current) {
          gameRef.current = mod.createGame('game-container')
        }

        const onStateUpdate = (state: GameStateSnapshot) => setGameState(state)
        const onSaveComplete = (result: { success: boolean }) => {
          setSaving(false)
          if (result.success) {
            toast.success('Game saved!')
          } else {
            toast.error('Save failed. Please try again.')
          }
        }
        const onBattleEnded = (outcome: BattleEndedPayload) => setBattleOutcome(outcome)
        const onSceneChanged = (payload: { scene: string; areaId?: string }) => {
          if (payload.scene !== 'battle') {
            setBattleOutcome(null)
          }
        }

        mod.gameEventBus.on(mod.GameEvent.STATE_UPDATED, onStateUpdate)
        mod.gameEventBus.on(mod.GameEvent.SAVE_COMPLETE, onSaveComplete)
        mod.gameEventBus.on(mod.GameEvent.BATTLE_ENDED, onBattleEnded)
        mod.gameEventBus.on(mod.GameEvent.SCENE_CHANGED, onSceneChanged)

        eventBusCleanupRef.current = () => {
          mod.gameEventBus.off(mod.GameEvent.STATE_UPDATED, onStateUpdate)
          mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete)
          mod.gameEventBus.off(mod.GameEvent.BATTLE_ENDED, onBattleEnded)
          mod.gameEventBus.off(mod.GameEvent.SCENE_CHANGED, onSceneChanged)
        }
      } catch (error) {
        if (cancelled) return
        console.error('Failed to load game module:', error)
        setInitError('Failed to load the game. Please refresh the page to try again.')
      }
    }

    init()

    return () => {
      cancelled = true
      cleanupGame()
    }
  }, [])

  useEffect(() => {
    if (!gameModuleRef.current || !gameState) return

    const scene = gameState.currentScene

    if (scene === 'battle') {
      gameModuleRef.current.gameEventBus.emit(
        gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED,
        { mode: 'battle', enabled: true }
      )
    } else {
      gameModuleRef.current.gameEventBus.emit(
        gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED,
        { mode: 'battle', enabled: false }
      )
    }

    if (scene === 'exploration') {
      gameModuleRef.current.gameEventBus.emit(
        gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED,
        { mode: 'exploration', enabled: true }
      )
    } else {
      gameModuleRef.current.gameEventBus.emit(
        gameModuleRef.current.GameEvent.OVERLAY_MODE_CHANGED,
        { mode: 'exploration', enabled: false }
      )
    }
  }, [gameState?.currentScene])

  return (
    <div className="relative flex-1 flex flex-col bg-[#0A0A0F]">
      <GameToolbar
        gameState={gameState}
        onSave={handleSave}
        onExit={() => setShowExitModal(true)}
        saving={saving}
      />

      <div ref={containerRef} id="game-container" className="flex-1 relative">
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
            />
          </div>
        )}
      </div>

      {initError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="mx-md rounded-md bg-surface-card p-lg text-center shadow-card-hover">
            <p className="font-display text-lg font-semibold text-text-primary">Game failed to load</p>
            <p className="mt-sm text-sm text-text-muted">{initError}</p>
            <Button
              onClick={() => navigate('/play')}
              variant="primary"
              size="md"
              className="mt-md"
            >
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
  )
}
