import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameStateSnapshot, PhaserGame } from '@/game'
import type { gameEventBus, GameEvent } from '@/game'
import GameToolbar from '@/components/game/GameToolbar'
import ExitModal from '@/components/game/ExitModal'
import ToastContainer, { toast } from '@/components/game/Toast'
import { useGameGuard } from '@/components/game/useGameGuard'

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
  const [showExitModal, setShowExitModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const eventBusCleanupRef = useRef<(() => void) | null>(null)

  const handleSave = useCallback(() => {
    setSaving(true)
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.SAVE_GAME)
  }, [])

  const autoSave = useCallback(() => {
    gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.SAVE_GAME)
  }, [])

  const cleanupGame = useCallback(() => {
    if (gameRef.current) {
      gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.EXIT_GAME)
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

      mod.gameEventBus.on(mod.GameEvent.STATE_UPDATED, onStateUpdate)
      mod.gameEventBus.on(mod.GameEvent.SAVE_COMPLETE, onSaveComplete)

      eventBusCleanupRef.current = () => {
        mod.gameEventBus.off(mod.GameEvent.STATE_UPDATED, onStateUpdate)
        mod.gameEventBus.off(mod.GameEvent.SAVE_COMPLETE, onSaveComplete)
      }
    }

    init()

    return () => {
      cancelled = true
      if (gameRef.current) {
        gameModuleRef.current?.gameEventBus.emit(gameModuleRef.current.GameEvent.EXIT_GAME)
        gameRef.current.destroy(true)
        gameRef.current = null
      }
      if (eventBusCleanupRef.current) {
        eventBusCleanupRef.current()
        eventBusCleanupRef.current = null
      }
    }
  }, [])

  return (
    <div className="relative flex-1 flex flex-col bg-[#0A0A0F]">
      <GameToolbar
        gameState={gameState}
        onSave={handleSave}
        onExit={() => setShowExitModal(true)}
        saving={saving}
      />

      <div ref={containerRef} id="game-container" className="flex-1 relative" />

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
