import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GameStateSnapshot } from '@arcane-familiars/game'
import GameToolbar from './GameToolbar'
import ExitModal from './ExitModal'
import ToastContainer, { toast } from './Toast'
import { useGameGuard } from './useGameGuard'

let gameEventBus: {
  on: (event: string, fn: (...args: any[]) => void) => void
  off: (event: string, fn: (...args: any[]) => void) => void
  emit: (event: string, ...args: any[]) => void
  clear: () => void
}
let GameEvent: Record<string, string>

async function loadGameModule() {
  const mod = await import('@arcane-familiars/game')
  gameEventBus = mod.gameEventBus
  GameEvent = mod.GameEvent as Record<string, string>
  return mod
}

export default function GamePage() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<unknown>(null)
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null)
  const [showExitModal, setShowExitModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(() => {
    setSaving(true)
    gameEventBus?.emit(GameEvent?.SAVE_GAME ?? 'game:save')
  }, [])

  const autoSave = useCallback(() => {
    gameEventBus?.emit(GameEvent?.SAVE_GAME ?? 'game:save')
  }, [])

  const cleanupGame = useCallback(() => {
    if (gameRef.current) {
      gameEventBus?.emit(GameEvent?.EXIT_GAME ?? 'game:exit')
      ;(gameRef.current as { destroy: (remove: boolean) => void }).destroy(true)
      gameRef.current = null
    }
    gameEventBus?.clear()
  }, [])

  const handleSaveAndExit = useCallback(() => {
    setSaving(true)
    gameEventBus?.emit(GameEvent?.SAVE_GAME ?? 'game:save')

    const onSaveComplete = (result: { success: boolean }) => {
      gameEventBus?.off(GameEvent?.SAVE_COMPLETE ?? 'game:saveComplete', onSaveComplete)
      cleanupGame()
      navigate('/play')
    }

    gameEventBus?.on(GameEvent?.SAVE_COMPLETE ?? 'game:saveComplete', onSaveComplete)

    setTimeout(() => {
      gameEventBus?.off(GameEvent?.SAVE_COMPLETE ?? 'game:saveComplete', onSaveComplete)
      cleanupGame()
      navigate('/play')
    }, 5000)
  }, [cleanupGame, navigate])

  const handleExitWithoutSave = useCallback(() => {
    cleanupGame()
    navigate('/play')
  }, [cleanupGame, navigate])

  const { handleBlockerProceed, handleBlockerReset } = useGameGuard({
    onAutoSave: autoSave,
    onShowExitModal: () => setShowExitModal(true),
  })

  const handleCancelExit = useCallback(() => {
    setShowExitModal(false)
    handleBlockerReset()
  }, [handleBlockerReset])

  const handleSaveAndExitFromModal = useCallback(() => {
    handleSaveAndExit()
    handleBlockerProceed()
  }, [handleSaveAndExit, handleBlockerProceed])

  const handleExitWithoutSaveFromModal = useCallback(() => {
    handleExitWithoutSave()
    handleBlockerProceed()
  }, [handleExitWithoutSave, handleBlockerProceed])

  useEffect(() => {
    async function init() {
      const { createGame } = await loadGameModule()
      if (containerRef.current && !gameRef.current) {
        gameRef.current = createGame('game-container')
      }
    }
    init()

    const onStateUpdate = (state: GameStateSnapshot) => setGameState(state)
    const onSaveComplete = (result: { success: boolean }) => {
      setSaving(false)
      if (result.success) {
        toast.success('Game saved!')
      } else {
        toast.error('Save failed. Please try again.')
      }
    }

    gameEventBus?.on(GameEvent?.STATE_UPDATED ?? 'game:stateUpdated', onStateUpdate)
    gameEventBus?.on(GameEvent?.SAVE_COMPLETE ?? 'game:saveComplete', onSaveComplete)

    return () => {
      gameEventBus?.off(GameEvent?.STATE_UPDATED ?? 'game:stateUpdated', onStateUpdate)
      gameEventBus?.off(GameEvent?.SAVE_COMPLETE ?? 'game:saveComplete', onSaveComplete)
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
