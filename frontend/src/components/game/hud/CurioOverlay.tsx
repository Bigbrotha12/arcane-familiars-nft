// Curio overlay: an unused room object with its description and choices, or the
// result of the choice that was taken. Center overlay; interactive. Follows
// TreasureOverlay's frame and palette so both read as the same panel family.

import Button from '@/components/ui/Button';
import type { GameStateSnapshot } from '@/game';

type CurioView = NonNullable<GameStateSnapshot['curio']>;
type CurioResultView = NonNullable<GameStateSnapshot['curioResult']>;

interface CurioOverlayProps {
  curio?: CurioView;
  result?: CurioResultView;
  onChoose: (optionId: string) => void;
  onLeave: () => void;
  onContinue: () => void;
}

function CurioOverlay({ curio, result, onChoose, onLeave, onContinue }: CurioOverlayProps) {
  if (!curio && !result) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="curio-overlay-title"
        className="hud-frame w-full max-w-sm rounded-lg p-lg"
      >
        {result ? (
          <>
            <h2 id="curio-overlay-title" className="mb-md font-display text-xl font-bold text-[#F0EFFF]">
              The curio answers
            </h2>
            <p className="mb-md font-body text-sm leading-relaxed text-[#F0EFFF]">{result.text}</p>
            {result.gains.length > 0 && (
              <ul className="mb-md flex flex-col gap-1">
                {result.gains.map((gain, index) => (
                  <li key={`${gain}-${index}`} className="font-mono text-sm tabular-nums text-[#2DD4BF]">
                    {gain}
                  </li>
                ))}
              </ul>
            )}
            <Button variant="primary" size="md" onClick={onContinue} autoFocus>
              Continue
            </Button>
          </>
        ) : (
          curio && (
            <>
              <h2 id="curio-overlay-title" className="mb-sm font-display text-xl font-bold text-[#F0EFFF]">
                {curio.name}
              </h2>
              <p className="mb-md font-body text-sm leading-relaxed text-[#A5A3C4]">{curio.description}</p>

              <div className="mb-md flex flex-col gap-2">
                {curio.options.map((option, index) => (
                  <div key={option.id} className="flex flex-col gap-1">
                    <Button
                      variant={index === 0 ? 'primary' : 'secondary'}
                      size="md"
                      disabled={!option.available}
                      onClick={() => onChoose(option.id)}
                      className="w-full"
                    >
                      {option.label}
                    </Button>
                    {!option.available && option.reason && (
                      <span className="font-body text-xs text-[#A5A3C4]">{option.reason}</span>
                    )}
                  </div>
                ))}
              </div>

              <Button variant="secondary" size="md" onClick={onLeave}>
                Leave
              </Button>
            </>
          )
        )}
      </div>
    </div>
  );
}

export default CurioOverlay;
