// Circular arc party panel (E1 design).
// Active familiar: larger arc with name on top, offset left.
// Inactive familiar(s): smaller grayscale arc with name below, offset right,
// positioned almost touching the active arc.
// Shared status effects rendered as a horizontal line below the inactive arc
// (up to 10 icons, wraps to a max of 2 lines).
//
// Interactive mode (onSwapClick provided): inactive cards become buttons that
// promote that familiar to party lead (out-of-battle swap) and carry an
// always-visible "Swap" badge; the active card gains an "Active" chip. Without
// the callback the panel renders exactly as before (battle HUD passes none).

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { FamiliarState } from '@/game';

interface StatusEffect {
  id: string;
  icon: string;
  duration?: number;
}

interface CircularArcPartyPanelProps {
  party: FamiliarState[];
  activeId?: string;
  statusEffects?: StatusEffect[];
  onSwapClick?: (familiarId: string) => void;
}

// Fallback unlock for a swap request that never resolves (e.g. network error,
// no state update follows). Success clears it immediately via activeId change.
const SWAP_PENDING_TIMEOUT_MS = 8000;

function renderArc(
  familiar: FamiliarState,
  isActive: boolean,
  size: number = 80,
  nameOnTop: boolean = false,
  labelAccessory?: ReactNode,
  /** Phone HUD: no name/chip rows (there is no room for them at half scale). */
  compact: boolean = false
) {
  const hpRatio = familiar.maxHp > 0 ? Math.min(1, Math.max(0, familiar.hp / familiar.maxHp)) : 0;
  const mpRatio = familiar.maxMp > 0 ? Math.min(1, Math.max(0, familiar.mp / familiar.maxMp)) : 0;

  // Grayscale for inactive
  const hpColor = isActive ? (hpRatio > 0.5 ? '#2DD4BF' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444') : '#6B7280';
  const mpColor = isActive ? '#7C5CFC' : '#4B5563';
  const textColor = isActive ? '#F0EFFF' : '#9CA3AF';
  const subtextColor = isActive ? '#B8B5E0' : '#6B7280';

  const strokeWidth = isActive ? 6 : 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const hpOffset = circumference * (1 - hpRatio);

  const nameLabel = (
    <span className="max-w-20 truncate font-body text-[10px] font-medium drop-shadow-md" style={{ color: textColor }}>
      {familiar.name}
    </span>
  );

  const labelRow = labelAccessory ? (
    <div className="flex items-center gap-1">
      {nameLabel}
      {labelAccessory}
    </div>
  ) : (
    nameLabel
  );

  return (
    <div className="flex flex-col items-center gap-1">
      {!compact && nameOnTop && labelRow}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1A1A2E"
            strokeWidth={strokeWidth}
            opacity={0.6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={hpColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={hpOffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - strokeWidth - 2}
            fill="none"
            stroke="#1A1A2E"
            strokeWidth={3}
            opacity={0.6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - strokeWidth - 2}
            fill="none"
            stroke={mpColor}
            strokeWidth={3}
            strokeDasharray={2 * Math.PI * (radius - strokeWidth - 2)}
            strokeDashoffset={2 * Math.PI * (radius - strokeWidth - 2) * (1 - mpRatio)}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0">
          <span
            className="font-mono font-bold tabular-nums drop-shadow-md"
            style={{ color: textColor, fontSize: compact ? (isActive ? '20px' : '16px') : isActive ? '11px' : '8px' }}
          >
            {Math.max(0, Math.floor(familiar.hp))}
          </span>
          <span
            className="font-mono tabular-nums"
            style={{ color: subtextColor, fontSize: compact ? (isActive ? '14px' : '11px') : isActive ? '8px' : '6px' }}
          >
            {Math.max(0, Math.floor(familiar.mp))} MP
          </span>
        </div>
      </div>
      {!compact && !nameOnTop && labelRow}
    </div>
  );
}

/** True on phone-width viewports, where the HUD stage is scaled to ~half size. */
function useIsPhone(): boolean {
  const query = '(max-width: 639px)';
  const [phone, setPhone] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setPhone(list.matches);
    list.addEventListener('change', onChange);
    setPhone(list.matches);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return phone;
}

function CircularArcPartyPanel({ party, activeId, statusEffects = [], onSwapClick }: CircularArcPartyPanelProps) {
  const [swapPendingId, setSwapPendingId] = useState<string | null>(null);

  const interactive = typeof onSwapClick === 'function';
  const compact = useIsPhone();

  // Hooks must run regardless of party contents (panel may render empty).
  const resolvedActiveId = activeId ?? party[0]?.id;

  // A state update promoting the requested familiar to lead means success.
  useEffect(() => {
    if (swapPendingId !== null && resolvedActiveId === swapPendingId) {
      setSwapPendingId(null);
    }
  }, [resolvedActiveId, swapPendingId]);

  // Error fallback: re-enable swapping if no resolution arrives in time.
  useEffect(() => {
    if (!swapPendingId) return;
    const timeoutId = window.setTimeout(() => setSwapPendingId(null), SWAP_PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [swapPendingId]);

  if (!party.length || resolvedActiveId === undefined) return null;

  const active = party.find((f) => f.id === resolvedActiveId) ?? party[0];
  const inactive = party.filter((f) => f.id !== active.id);

  const handleSwap = (familiarId: string) => {
    if (!interactive || swapPendingId !== null) return;
    setSwapPendingId(familiarId);
    onSwapClick?.(familiarId);
  };

  const activeChip = interactive ? (
    <span className="rounded-full border border-teal/60 bg-teal/15 px-1.5 py-px font-display text-[9px] font-semibold leading-tight text-[#F0EFFF]">
      Active
    </span>
  ) : undefined;

  return (
    <div
      className={`pointer-events-none flex items-center ${
        compact ? 'flex-row justify-center gap-2' : 'flex-col gap-1'
      }`}
    >
      {/* Active familiar - larger, name on top, offset left */}
      <div className={compact ? 'relative' : 'relative -ml-9'}>
        {renderArc(active, true, compact ? 88 : 58, true, compact ? undefined : activeChip, compact)}
      </div>

      {/* Inactive familiar(s) - smaller, grayscale, offset right, almost touching.
          In interactive mode each card is a button promoting it to party lead.
          Fainted cards keep their Swap badge but dimmed and non-clickable. */}
      {inactive.map((familiar) => {
        const isFainted = familiar.hp <= 0;
        const swapBadge = interactive ? (
          isFainted ? (
            <span className="rounded-full border border-[#4B5563]/60 bg-[#2D2A5E]/40 px-1.5 py-px font-display text-[9px] font-semibold leading-tight text-text-muted">
              Swap
            </span>
          ) : (
            <span className="rounded-full border border-accent/70 bg-accent/25 px-1.5 py-px font-display text-[9px] font-semibold leading-tight text-accent-light transition-colors duration-150 group-hover:border-accent group-hover:bg-accent/40">
              Swap
            </span>
          )
        ) : undefined;

        if (!interactive || isFainted) {
          return (
            <div key={familiar.id} className={compact ? 'relative opacity-60' : 'relative -mr-9 -mt-0.5 opacity-60'}>
              {renderArc(familiar, false, compact ? 64 : 46, false, compact ? undefined : swapBadge, compact)}
            </div>
          );
        }

        return (
          <button
            key={familiar.id}
            type="button"
            onClick={() => handleSwap(familiar.id)}
            disabled={swapPendingId === familiar.id}
            aria-label={`Make ${familiar.name} the active familiar`}
            className={`group pointer-events-auto relative flex cursor-pointer flex-col items-center rounded-md transition duration-150 ease-out hover:-translate-y-px hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
              compact ? '' : '-mr-9 -mt-0.5'
            }`}
          >
            {renderArc(familiar, false, compact ? 64 : 46, false, compact ? undefined : swapBadge, compact)}
          </button>
        );
      })}

      {/* Shared status effects - horizontal, below inactive, wraps to 2 lines max */}
      {statusEffects.length > 0 && (
        <div
          className={`flex flex-wrap items-center justify-center gap-1 ${
            compact ? 'max-w-[96px]' : 'mt-1 max-w-[132px]'
          }`}
        >
          {statusEffects.map((effect) => (
            <div
              key={effect.id}
              className="relative flex h-5 w-5 items-center justify-center rounded-full bg-[#2D2A5E]/80 text-[10px] backdrop-blur-sm"
              title={effect.id}
            >
              {effect.icon}
              {effect.duration !== undefined && (
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#1E1B4B] px-0.5 font-mono text-[7px] text-[#A5A3C4]">
                  {effect.duration}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CircularArcPartyPanel;
