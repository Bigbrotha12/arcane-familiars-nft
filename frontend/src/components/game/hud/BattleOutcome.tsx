// Full-canvas victory/defeat/fled overlay with rewards. Continue dismisses it
// via onContinue (GamePage emits BATTLE_CONTINUE to Phaser in Step 6).
// Reward lines rise in with a short stagger (DESIGN.md: cards rise in, 250ms
// ease-out) and stay readable when prefers-reduced-motion is set.

import { useEffect, useState, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import AffinityChip from './AffinityChip';
import { portraitPath } from '@/components/collection/entries';
import {
  Affinity,
  Rarity,
  SIGNATURE_BY_AFFINITY,
  getAbility,
  getFamiliar,
  getItem,
  itemRarity,
  charmModsLabel,
  charmName,
} from '@arcane-familiars/game-logic';
import { RARITY_TEXT_CLASS } from './rarityStyles';
import type { BattleEndedPayload, FamiliarState } from '@/game';

const SIGNATURE_IDS = new Set(Object.values(SIGNATURE_BY_AFFINITY));
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

const romanTier = (tier: number): string => ROMAN[tier] ?? String(tier);

/** Rewards arrive as item ids; show the display name, falling back to the id. */
function itemNames(ids: string[]): string {
  return ids.map((id) => getItem(id)?.name ?? id).join(', ');
}

interface BattleOutcomeProps {
  outcome: BattleEndedPayload;
  /** Current party (from the battle snapshot), used for recruit swaps. */
  party?: FamiliarState[];
  onContinue: () => void;
  onRecruitSwap?: (outId: string) => void;
}

interface RewardLineProps {
  index: number;
  entered: boolean;
  children: ReactNode;
  className?: string;
}

function RewardLine({ index, entered, children, className = '' }: RewardLineProps) {
  return (
    <p
      className={`font-mono text-xs tabular-nums transition-all duration-300 ease-out motion-reduce:transition-none ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      } ${className}`}
      style={{ transitionDelay: `${index * 70}ms` }}
    >
      {children}
    </p>
  );
}

function BondLine({
  index,
  entered,
  bond,
  needed,
  name,
}: {
  index: number;
  entered: boolean;
  bond: number;
  needed: number;
  name: string;
}) {
  const percent = needed > 0 ? Math.min(100, Math.round((bond / needed) * 100)) : 0;
  const remaining = Math.max(0, needed - bond);

  return (
    <div
      className={`flex w-full flex-col items-center gap-1 transition-all duration-300 ease-out motion-reduce:transition-none ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
      style={{ transitionDelay: `${index * 70}ms` }}
    >
      <p className="font-mono text-xs tabular-nums text-pink">
        Bond with {name}: {bond}/{needed}
      </p>
      <div
        className="h-1 w-32 overflow-hidden rounded-full bg-[#3B3870]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={bond}
        aria-label={`Recruit bond with ${name}`}
      >
        <div
          className="h-full rounded-full bg-pink transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="font-body text-[10px] text-[#A5A3C4]">Win {remaining} more to recruit</p>
    </div>
  );
}

type ChestReward = NonNullable<NonNullable<BattleEndedPayload['rewards']>['bossChest']>;

/** Chest spoils block shared by the boss chest and elite spoils. */
function SpoilsChest({
  title,
  chest,
  delayIndex,
  entered,
  elite = false,
}: {
  title: string;
  chest: ChestReward;
  delayIndex: number;
  entered: boolean;
  elite?: boolean;
}) {
  return (
    <div
      className={`mt-1 flex w-full flex-col items-center gap-1 rounded-md border bg-[#2D2A5E]/80 p-md transition-all duration-300 ease-out motion-reduce:transition-none ${
        elite ? 'border-[#F472B6]/40' : 'border-[#FBBF24]/40'
      } ${entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
      style={{ transitionDelay: `${delayIndex * 70}ms` }}
    >
      <h3 className={`font-display text-sm font-semibold ${elite ? 'text-pink' : 'text-yellow'}`}>{title}</h3>
      <ul className="flex w-full flex-col items-center gap-0.5">
        {chest.items.map((id, chestIndex) => {
          const item = getItem(id);
          return (
            <li key={`${title}-${id}-${chestIndex}`} className="flex items-center gap-1.5">
              {item?.icon && (
                <img
                  src={`/assets/sprites/items/${item.icon}.png`}
                  alt=""
                  className="h-5 w-5 rounded-sm border border-[#E8E4F0] bg-white object-contain"
                />
              )}
              <span className={`font-body text-xs ${RARITY_TEXT_CLASS[item ? itemRarity(item) : 'common']}`}>
                {item?.name ?? id}
              </span>
            </li>
          );
        })}
      </ul>
      {chest.charm && (
        <div className="flex flex-col items-center">
          <span className={`font-body text-xs ${RARITY_TEXT_CLASS[chest.charm.rarity]}`}>
            ◆ {charmName(chest.charm)}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-[#A5A3C4]">{charmModsLabel(chest.charm)}</span>
        </div>
      )}
      {chest.currency > 0 && <p className="font-mono text-xs tabular-nums text-yellow">+{chest.currency} coins</p>}
    </div>
  );
}

function BattleOutcome({ outcome, party = [], onContinue, onRecruitSwap }: BattleOutcomeProps) {
  const { outcome: result, rewards } = outcome;
  const isVictory = result === 'victory';

  // Flip one frame after mount so the CSS transition actually runs.
  const [entered, setEntered] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const title = isVictory ? 'Victory!' : result === 'defeat' ? 'Defeated...' : 'You Fled';
  const titleColor = isVictory ? 'text-teal' : result === 'defeat' ? 'text-error' : 'text-warning';
  const flavor = isVictory
    ? 'Your familiars prevailed!'
    : result === 'defeat'
      ? 'Your party has fallen... all loot found this run is lost.'
      : 'You escaped the encounter.';

  const levelUps: { name?: string; levels?: number; bench: boolean }[] = [];
  if (rewards?.levelUp) {
    levelUps.push({ name: rewards.activeFamiliarName, levels: rewards.levelUp, bench: false });
  }
  if (rewards?.benchLevelUp) {
    levelUps.push({ name: rewards.benchFamiliarName, levels: rewards.benchLevelUp, bench: true });
  }
  // Stagger budget: rewards first, then level-ups, then the recruit callout.
  let lineIndex = 0;

  const recruit = rewards?.recruitedName ? getFamiliar(rewards.recruitedFamiliar ?? '') : undefined;
  const recruitAffinity = recruit ? (Affinity[recruit.affinity] ?? String(recruit.affinity)) : undefined;
  const recruitRarity = recruit ? (Rarity[recruit.rarity] ?? String(recruit.rarity)) : undefined;
  const recruitAbilities = recruit?.abilities.map((id) => getAbility(id)?.name ?? id) ?? [];
  const joinLevel = rewards?.recruitedLevel ?? 1;
  const showRecruit = Boolean(isVictory && rewards?.recruitedName);
  const canSwap =
    showRecruit &&
    outcome.inDungeon === true &&
    Boolean(rewards?.recruitedFamiliar) &&
    party.length > 0 &&
    Boolean(onRecruitSwap);

  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="hud-frame flex w-full max-w-[300px] flex-col items-center gap-4 rounded-md p-lg text-center">
        <h2 className={`font-display text-2xl font-semibold ${titleColor}`}>{title}</h2>

        <div className="flex w-full flex-col items-center gap-1.5">
          <p className="font-body text-xs text-[#B8B5E0]">{flavor}</p>

          {isVictory && rewards && (
            <div className="mt-0.5 flex w-full flex-col items-center gap-0.5">
              {rewards.currency > 0 && (
                <RewardLine index={lineIndex++} entered={entered} className="text-sm text-yellow">
                  +{rewards.currency} coins
                </RewardLine>
              )}
              {rewards.items.length > 0 && (
                <p className="font-body text-xs text-[#F0EFFF]">Found: {itemNames(rewards.items)}</p>
              )}
              {rewards.bossChest && (
                <SpoilsChest title="Boss chest" chest={rewards.bossChest} delayIndex={lineIndex++} entered={entered} />
              )}
              {rewards.eliteChest && (
                <SpoilsChest
                  title="Elite spoils"
                  chest={rewards.eliteChest}
                  delayIndex={lineIndex++}
                  entered={entered}
                  elite
                />
              )}
              {rewards.xp ? (
                <RewardLine index={lineIndex++} entered={entered} className="text-accent">
                  +{rewards.xp} XP · {rewards.activeFamiliarName ?? 'Active familiar'}
                </RewardLine>
              ) : null}
              {rewards.benchXp ? (
                <RewardLine index={lineIndex++} entered={entered} className="text-[#B8B5E0]">
                  +{rewards.benchXp} XP · {rewards.benchFamiliarName ?? rewards.benchFamiliarId ?? 'Bench'} (bench)
                </RewardLine>
              ) : null}
              {levelUps.map((entry) => (
                <RewardLine
                  key={`${entry.bench ? 'bench' : 'active'}-levelup`}
                  index={lineIndex++}
                  entered={entered}
                  className="font-display text-sm font-semibold text-teal"
                >
                  {entry.name ?? (entry.bench ? 'Bench familiar' : 'Active familiar')} levelled up! +{entry.levels}
                </RewardLine>
              ))}
              {rewards.learned?.map((entry, learnedIndex) => {
                const isRankUp = entry.abilityId.endsWith('_2');
                const baseAbilityId = isRankUp ? entry.abilityId.slice(0, -2) : entry.abilityId;
                const isSignature = SIGNATURE_IDS.has(baseAbilityId);
                return (
                  <RewardLine
                    key={`learned-${entry.familiarId}-${entry.abilityId}-${learnedIndex}`}
                    index={lineIndex++}
                    entered={entered}
                    className={`font-display text-teal ${
                      isSignature ? 'text-base font-bold' : 'text-sm font-semibold'
                    }`}
                  >
                    {entry.familiarName} learned {entry.abilityName}!{isRankUp ? ' ↑' : ''}
                  </RewardLine>
                );
              })}
              {rewards.passiveUnlocks?.map((entry, unlockIndex) => (
                <RewardLine
                  key={`passive-${entry.familiarId}-${entry.passiveId}-${entry.tier}-${unlockIndex}`}
                  index={lineIndex++}
                  entered={entered}
                  className="font-display text-sm font-semibold text-teal"
                >
                  {entry.tier === 1
                    ? `${entry.familiarName} unlocked ${entry.passiveName}!`
                    : `${entry.familiarName}'s ${entry.passiveName} grew to ${romanTier(entry.tier)}!`}
                </RewardLine>
              ))}
              {rewards.recruitProgress ? (
                <BondLine
                  index={lineIndex++}
                  entered={entered}
                  name={rewards.recruitProgress.name}
                  bond={rewards.recruitProgress.bond}
                  needed={rewards.recruitProgress.needed}
                />
              ) : null}

              {showRecruit ? (
                <div
                  className={`mt-1 flex w-full flex-col items-center gap-2 rounded-md border border-[#F472B6]/40 bg-[#2D2A5E]/80 p-md transition-all duration-300 ease-out motion-reduce:transition-none ${
                    entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                  }`}
                  style={{
                    transitionDelay: `${lineIndex * 70 + 120}ms`,
                    boxShadow: entered ? '0 0 28px rgba(244, 114, 182, 0.35)' : '0 0 0 rgba(244, 114, 182, 0)',
                  }}
                >
                  <h3 className="font-display text-lg font-semibold text-pink">New familiar!</h3>

                  <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-[#F472B6]/40 bg-gradient-to-br from-[#2D2A5E] to-[#1E1B4B]">
                    {recruit && !portraitFailed ? (
                      <img
                        src={portraitPath(recruit.id)}
                        alt={recruit.name}
                        className="h-full w-full object-contain"
                        onError={() => setPortraitFailed(true)}
                      />
                    ) : (
                      <span className="font-display text-3xl font-semibold text-pink/60" aria-hidden="true">
                        {(rewards?.recruitedName ?? '?').charAt(0)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <p className="font-display text-base font-semibold text-[#F0EFFF]">{rewards?.recruitedName}</p>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      {recruitRarity && (
                        <span className="font-body text-[10px] uppercase tracking-wider text-pink">
                          {recruitRarity}
                        </span>
                      )}
                      <AffinityChip affinity={recruitAffinity} size="sm" />
                      <span className="font-mono text-[11px] tabular-nums text-[#B8B5E0]">Lv {joinLevel}</span>
                    </div>
                  </div>

                  {recruitAbilities.length > 0 && (
                    <p className="font-body text-[11px] leading-snug text-[#B8B5E0]">
                      <span className="text-[#A5A3C4]">Abilities: </span>
                      {recruitAbilities.join(', ')}
                    </p>
                  )}

                  {canSwap && (
                    <div className="mt-1 flex w-full flex-col gap-1.5">
                      {party.map((member) => (
                        <Button
                          key={member.id}
                          variant="secondary"
                          size="sm"
                          onClick={() => onRecruitSwap?.(member.id)}
                        >
                          Swap in for {member.name}
                        </Button>
                      ))}
                      <Button variant="primary" size="sm" onClick={onContinue}>
                        Keep at camp
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {result === 'defeat' && outcome.lostLoot ? (
            <div className="mt-0.5 flex flex-col items-center gap-0.5">
              {outcome.lostLoot.currency > 0 && (
                <p className="font-mono text-sm tabular-nums text-error">-{outcome.lostLoot.currency} coins</p>
              )}
              {outcome.lostLoot.items.length > 0 && (
                <p className="font-body text-xs text-[#F0EFFF]">
                  Lost: {outcome.lostLoot.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}
                </p>
              )}
            </div>
          ) : null}
        </div>

        {!canSwap && (
          <Button size="md" onClick={onContinue}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

export default BattleOutcome;
