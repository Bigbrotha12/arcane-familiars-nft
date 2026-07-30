import { useEffect, useCallback } from 'react'
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
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        onAutoSave()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onAutoSave])

  return {
    handleBlockerProceed,
    handleBlockerReset,
  }
}
