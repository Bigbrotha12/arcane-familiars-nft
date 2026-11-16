import { useEffect, ReactNode } from 'react';

// How many modals are mounted right now. Overlays that own global shortcuts
// (encounter Fight/Flee, boss Enter/Retreat) consult this so an open modal —
// the exit dialog, for example — does not also trigger them.
let openModalCount = 0;

export function isModalOpen(): boolean {
  return openModalCount > 0;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Dark, solid, double-outlined frame — used for in-game HUD modals that
      render over the Phaser canvas (ability/item/exit). Default is the light
      surface-card style used by the landing page. */
  hud?: boolean;
  /** Dense in-game sizing (narrow width, tighter padding/type) for modals
      that live inside the 800x600 design-space HUD stage. */
  compact?: boolean;
}

function Modal({ open, onClose, title, children, hud = false, compact = false }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    openModalCount += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      openModalCount = Math.max(0, openModalCount - 1);
      // Only release the scroll lock when the last modal closes, so closing a
      // nested dialog cannot un-lock a still-open parent.
      if (openModalCount === 0) document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-md">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      {/* `compact` modals live inside the 800x600 HUD stage, so on a phone they
          render at roughly half size; the `max-sm:` rules double the design-space
          type so the in-game panels stay readable at 390px wide. */}
      <div
        className={`relative w-full rounded-lg animate-in fade-in zoom-in-95 duration-200 ${
          compact ? 'max-w-[300px] p-md' : 'max-w-md p-lg'
        } ${hud ? 'hud-frame rounded-lg' : 'bg-surface-card shadow-card-hover'} ${
          compact ? 'max-sm:max-w-[600px] max-sm:p-lg max-sm:[&_p]:text-[19px] max-sm:[&_button]:text-[20px]' : ''
        }`}
      >
        {title && (
          <div className={`flex items-center justify-between ${compact ? 'mb-sm' : 'mb-md'}`}>
            <h2
              className={`font-display font-semibold ${compact ? 'text-sm max-sm:text-[28px]' : 'text-xl'} ${
                hud ? 'text-[#F0EFFF]' : 'text-text-primary'
              }`}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className={`p-1 transition-colors ${
                hud ? 'text-[#A5A3C4] hover:text-[#F0EFFF]' : 'text-text-muted hover:text-text-primary'
              }`}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default Modal;
