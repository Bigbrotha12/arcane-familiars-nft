import { useEffect, ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Dark, solid, double-outlined frame — used for in-game HUD modals that
      render over the Phaser canvas (ability/item/exit). Default is the light
      surface-card style used by the landing page. */
  hud?: boolean
}

function Modal({ open, onClose, title, children, hud = false }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-md">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative w-full max-w-md rounded-lg p-lg animate-in fade-in zoom-in-95 duration-200 ${
          hud
            ? 'hud-frame rounded-lg'
            : 'bg-surface-card shadow-card-hover'
        }`}
      >
        {title && (
          <div className="flex items-center justify-between mb-md">
            <h2
              className={`text-xl font-display font-semibold ${
                hud ? 'text-[#F0EFFF]' : 'text-text-primary'
              }`}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className={`p-1 transition-colors ${
                hud
                  ? 'text-[#A5A3C4] hover:text-[#F0EFFF]'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export default Modal
