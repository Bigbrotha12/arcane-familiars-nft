// Shared scrollable log (newest at the bottom, auto-scrolls on update).
// Interactive so the player can scroll; anchored right side by the HUD.

import { useEffect, useRef } from 'react'

interface ScrollableLogProps {
  title: string
  entries: string[]
  emptyText: string
}

function ScrollableLog({ title, entries, emptyText }: ScrollableLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries])

  return (
    <div className="pointer-events-auto flex max-h-40 w-60 flex-col overflow-hidden rounded-md bg-[#1E1B4B]/85 shadow-card backdrop-blur-sm">
      <div className="border-b border-[#2A2A45] px-sm py-1.5">
        <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-[#B8B5E0]">
          {title}
        </h3>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-sm py-1.5">
        {entries.length === 0 ? (
          <p className="font-mono text-xs text-[#8F8BBF]">{emptyText}</p>
        ) : (
          // Index keys are correct here because the source log is append-only
          // (newest last, capped). If the log ever supports reordering/filtering,
          // switch to stable keys.
          entries.map((entry, index) => (
            <p key={index} className="font-mono text-xs leading-relaxed text-[#B8B5E0]">
              {entry}
            </p>
          ))
        )}
      </div>
    </div>
  )
}

export default ScrollableLog
