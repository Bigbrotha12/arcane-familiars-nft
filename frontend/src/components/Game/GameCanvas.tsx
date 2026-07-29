import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'

const GAME_URL = import.meta.env.VITE_GAME_URL || 'http://localhost:3000'

export default function GameCanvas(): JSX.Element {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = () => {
    setLoading(false)
  }

  const handleError = () => {
    setLoading(false)
    setError('Failed to load the game. Please try again.')
  }

  const handleExit = () => {
    navigate('/app')
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-[57px] z-50 bg-surface-primary">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-primary">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-secondary font-body">Loading Game...</p>
          </div>
        </div>
      )}

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-primary">
          <div className="text-center">
            <p className="text-text-secondary font-body mb-4">{error}</p>
            <Button onClick={handleExit}>Back to Home</Button>
          </div>
        </div>
      ) : (
        <iframe
          src={GAME_URL}
          className="w-full h-full border-0"
          title="Arcane Familiars Game"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      <button
        onClick={handleExit}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-surface-primary/80 backdrop-blur-sm border border-border text-text-secondary hover:text-text-primary hover:bg-surface-alt transition-all"
        aria-label="Exit Game"
      >
        ✕
      </button>
    </div>
  )
}
