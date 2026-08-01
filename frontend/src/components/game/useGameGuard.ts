import { useEffect, useCallback, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

interface UseGameGuardOptions {
  onAutoSave: () => void
  onShowExitModal: () => void
}

export function useGameGuard({ onAutoSave, onShowExitModal }: UseGameGuardOptions) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname
  )

  const isBlockerActive = blocker.state === 'blocked'

  useEffect(() => {
    if (blocker.state === 'blocked') {
      onShowExitModal()
    }
  }, [blocker.state, onShowExitModal])

  const handleBlockerProceed = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed()
  }, [blocker])

  const handleBlockerReset = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Ref to hold the latest onAutoSave callback (avoids re-binding the event listener)
  const autoSaveRef = useRef(onAutoSave)
  autoSaveRef.current = onAutoSave

  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        autoSaveRef.current()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  return {
    handleBlockerProceed,
    handleBlockerReset,
    isBlockerActive,
  }
}
