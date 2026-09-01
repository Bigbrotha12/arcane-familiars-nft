// Compact single-latest-event log box (Pokemon-style bottom text box).
// Non-interactive: shows the newest entry, older history is dropped from view.

interface EventBoxProps {
  title: string;
  entries: string[];
  emptyText: string;
}

function EventBox({ title, entries, emptyText }: EventBoxProps) {
  const latest = entries.length > 0 ? entries[entries.length - 1] : emptyText;

  return (
    <div className="flex min-h-14 flex-col gap-0.5 rounded-md bg-[#1E1B4B]/85 px-sm py-1.5 shadow-card backdrop-blur-sm">
      <span className="font-display text-[9px] font-semibold uppercase tracking-wider text-[#7C5CFC]">{title}</span>
      <p className="break-words font-body text-xs leading-snug text-[#B8B5E0]">{latest}</p>
    </div>
  );
}

export default EventBox;
