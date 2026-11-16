// Pure first-time tip rules: which tips a snapshot triggers, and how those
// triggers turn into a one-at-a-time queue. Kept free of React and storage so
// it can be unit-tested directly (see tipRules.test.ts).

import type { GameStateSnapshot } from '@/game';

export type TipId =
  | 'explore'
  | 'encounter'
  | 'battleStart'
  | 'charge'
  | 'swap'
  | 'knockout'
  | 'treasure'
  | 'curio'
  | 'elite'
  | 'levelUp'
  | 'recruit'
  | 'charm'
  | 'defeat'
  | 'worldMap';

export interface TipDefinition {
  id: TipId;
  title: string;
  body: string;
  /** True while the situation this tip explains is present in the snapshot. */
  triggered: (snapshot: GameStateSnapshot) => boolean;
}

const battleOutcome = (snapshot: GameStateSnapshot) => snapshot.battleOutcome;
const battleRewards = (snapshot: GameStateSnapshot) => snapshot.battleOutcome?.rewards;

function rewardHasCharm(snapshot: GameStateSnapshot): boolean {
  const rewards = battleRewards(snapshot);
  return Boolean(rewards?.bossChest?.charm || rewards?.eliteChest?.charm || rewards?.dailyBonus?.charm);
}

function isBattle(snapshot: GameStateSnapshot): boolean {
  return snapshot.currentScene === 'battle';
}

/**
 * Table order is the display order. When several tips trigger together the
 * queue is sorted by this array so the player sees them in the intended order.
 */
export const TIPS: readonly TipDefinition[] = [
  {
    id: 'explore',
    title: 'Exploring',
    body: 'Pick an exit to move. Rooms marked with a chest are side detours worth taking; the red room is the boss.',
    triggered: (snapshot) => snapshot.currentScene === 'exploration' && Boolean(snapshot.dungeon),
  },
  {
    id: 'encounter',
    title: 'A wild familiar',
    body: 'Fight or flee. The matchup lines show who has the edge. "Recruitable" means each win here builds bond toward joining you.',
    triggered: (snapshot) => snapshot.encounterActive === true,
  },
  {
    id: 'battleStart',
    title: 'Your turn',
    body: 'Attack restores a little MP. Defend halves the next hit. Abilities cost MP and hit harder.',
    triggered: (snapshot) => isBattle(snapshot) && snapshot.phase === 'menu' && Boolean(snapshot.enemy),
  },
  {
    id: 'charge',
    title: 'Big attack coming',
    body: 'It is gathering power. Defend now to halve the blow.',
    triggered: (snapshot) => isBattle(snapshot) && snapshot.enemy?.charged === true,
  },
  {
    id: 'swap',
    title: 'Your backup',
    body: "Swap to bring in your other familiar. Both familiars' passives help whoever is fighting.",
    triggered: (snapshot) => isBattle(snapshot) && snapshot.canSwap === true,
  },
  {
    id: 'knockout',
    title: 'Relay',
    body: 'When a familiar falls, your backup steps in automatically. The run ends only if both fall.',
    triggered: (snapshot) => isBattle(snapshot) && snapshot.forcedSwap === true,
  },
  {
    id: 'treasure',
    title: 'Treasure',
    body: "Take the chest to add it to this run's loot. Run loot is banked when you leave or beat the boss.",
    triggered: (snapshot) => snapshot.treasureActive === true,
  },
  {
    id: 'curio',
    title: 'Curios',
    body: 'Risky choices can pay off or hurt. Paying an item or coins gives a sure result. You can always walk away.',
    triggered: (snapshot) => Boolean(snapshot.curio) || Boolean(snapshot.curioResult),
  },
  {
    id: 'elite',
    title: 'Elite',
    body: 'Elites are tougher and have a special trait. Beat them for a rare chest and double coins.',
    triggered: (snapshot) =>
      (snapshot.encounterActive === true && Boolean(snapshot.pendingEncounter?.elite)) ||
      (isBattle(snapshot) && Boolean(snapshot.enemy?.elite)),
  },
  {
    id: 'levelUp',
    title: 'Growing stronger',
    body: 'New abilities unlock at Lv 3, 6, 9 and 12. Passives unlock at Lv 5 and grow at 10, 15 and 20.',
    triggered: (snapshot) => {
      const outcome = battleOutcome(snapshot);
      const rewards = battleRewards(snapshot);
      return (
        outcome?.outcome === 'victory' &&
        Boolean(
          rewards?.levelUp || rewards?.benchLevelUp || rewards?.learned?.length || rewards?.passiveUnlocks?.length
        )
      );
    },
  },
  {
    id: 'recruit',
    title: 'A new friend',
    body: 'Swap it in now, or keep it at camp and pick it at party select later.',
    triggered: (snapshot) => {
      const outcome = battleOutcome(snapshot);
      const rewards = battleRewards(snapshot);
      return outcome?.outcome === 'victory' && Boolean(rewards?.recruitedFamiliar || rewards?.recruitedName);
    },
  },
  {
    id: 'charm',
    title: 'Charms',
    body: 'Each familiar can wear one charm. Equip them from Charms on the world map.',
    triggered: (snapshot) =>
      Boolean(snapshot.treasureActive && snapshot.treasure?.charm) ||
      Boolean(snapshot.curioResult?.charms?.length) ||
      rewardHasCharm(snapshot),
  },
  {
    id: 'defeat',
    title: 'Defeat',
    body: 'Run loot is lost when your party falls. Retreating from a dungeon keeps it.',
    triggered: (snapshot) => battleOutcome(snapshot)?.outcome === 'defeat',
  },
  {
    id: 'worldMap',
    title: 'Between runs',
    body: "Spend coins at the Shop, equip Charms, and try today's Daily Expedition.",
    triggered: (snapshot) => snapshot.currentScene === 'world_map' && snapshot.battleCount > 0,
  },
] as const;

const TIP_ORDER = new Map<TipId, number>(TIPS.map((tip, index) => [tip.id, index]));

export function getTip(id: TipId): TipDefinition {
  const tip = TIPS.find((candidate) => candidate.id === id);
  if (!tip) throw new Error(`Unknown tip id: ${id}`);
  return tip;
}

/** Tip ids whose trigger currently matches the snapshot, in table order. */
export function detectTips(snapshot: GameStateSnapshot): TipId[] {
  return TIPS.filter((tip) => tip.triggered(snapshot)).map((tip) => tip.id);
}

/**
 * True while a centered overlay (encounter, treasure, curio, boss, battle
 * outcome) owns the screen. Tips are held then so a card can never cover the
 * overlay it is describing — especially on a 360px-wide canvas.
 */
export function isOverlayActive(snapshot: GameStateSnapshot): boolean {
  if (isBattle(snapshot)) return snapshot.phase === 'outcome';
  return Boolean(
    snapshot.encounterActive || snapshot.treasureActive || snapshot.bossRoom || snapshot.curio || snapshot.curioResult
  );
}

/**
 * Append newly detected tips that are neither seen nor already queued/current,
 * then re-sort the whole queue by table order. Returns the same array when
 * nothing changed so React can skip a render.
 */
export function mergeTipQueue(
  queue: readonly TipId[],
  detected: readonly TipId[],
  seen: ReadonlySet<TipId>,
  current: TipId | null
): TipId[] {
  const known = new Set<TipId>(queue);
  if (current) known.add(current);

  const additions = detected.filter((id) => !seen.has(id) && !known.has(id));
  if (additions.length === 0) return queue as TipId[];

  const merged = [...queue, ...additions];
  return merged.sort((a, b) => (TIP_ORDER.get(a) ?? 0) - (TIP_ORDER.get(b) ?? 0));
}

/**
 * Tips that explain a centered overlay. They show while that overlay is open
 * (the card sits in a top corner), instead of after it closes, when the
 * situation they describe is already over.
 */
export const OVERLAY_TIPS: ReadonlySet<TipId> = new Set<TipId>([
  'encounter',
  'treasure',
  'curio',
  'elite',
  'levelUp',
  'recruit',
  'charm',
  'defeat',
]);

/**
 * The next tip to show: the first queued tip whose trigger is true right now
 * (`active`, from detectTips on the current snapshot). While an overlay is
 * open only overlay tips qualify. Queued tips whose moment has passed stay
 * queued (unseen) and show the next time their situation comes up.
 */
export function nextTip(queue: readonly TipId[], blocked: boolean, active: readonly TipId[]): TipId | null {
  const now = new Set(active);
  return queue.find((id) => now.has(id) && (!blocked || OVERLAY_TIPS.has(id))) ?? null;
}
