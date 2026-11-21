// Small anchored popover used by the slim game bar (settings and account).
// Owns its open state so both menus share the same outside-click / Escape
// behaviour and the trigger always gets aria-expanded/haspopup wired up.

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';

export interface PopoverTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-haspopup': 'menu' | 'dialog' | boolean;
  'aria-expanded': boolean;
  'aria-label': string;
}

interface PopoverProps {
  /** Accessible name for the trigger button. */
  label: string;
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode;
  /** Which edge of the trigger the panel aligns to. */
  align?: 'left' | 'right';
  haspopup?: 'menu' | 'dialog' | boolean;
  role?: 'menu' | 'dialog';
  panelClassName?: string;
}

export default function Popover({
  label,
  trigger,
  children,
  align = 'right',
  haspopup = 'menu',
  role = 'menu',
  panelClassName = '',
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Move focus into the menu so keyboard users land on the first row, but
    // leave it alone for pointer users who only clicked the trigger.
    const first = panelRef.current?.querySelector<HTMLElement>('[role^="menuitem"], button, [href], input');
    first?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((value) => !value),
        'aria-haspopup': haspopup,
        'aria-expanded': open,
        'aria-label': label,
      })}
      {open && (
        <div
          ref={panelRef}
          role={role}
          className={`absolute top-full z-50 mt-2 w-[220px] rounded-md border border-border bg-surface-card p-1 text-text-primary shadow-card ${
            align === 'left' ? 'left-0' : 'right-0'
          } ${panelClassName}`.trim()}
        >
          {children}
        </div>
      )}
    </div>
  );
}
