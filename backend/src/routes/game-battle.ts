import { Hono } from 'hono';
import type {
  BattleState,
  BattleFamiliar,
  BattleAction,
  BattleTurnResult,
  BattleRewards,
  ForcedSwapInfo,
  GameState,
  ItemData,
  CharmRoll,
} from '@arcane-familiars/game-logic';
import {
  AREAS,
  getFamiliar,
  getItem,
  scaleEnemy,
  selectEnemyAction,
  resolveTurn,
  checkBattleOutcome,
  updateCooldowns,
  validateBattleAction,
  seededRandom,
  resolveBattleRoomId,
  applyFamiliarXp,
  applyRecruitWin,
  scaleFamiliarStats,
  applyCharm,
  equippedCharm,
  abilitiesAtLevel,
  newlyLearned,
  newPassiveTiers,
  partyPassives,
  PASSIVES,
  getAbility,
  battleXp,
  BALANCE,
  MAX_FAMILIAR_LEVEL,
  applyElite,
  getRunLoot,
  addInventoryItem,
  bankRunLoot,
  discardRunLoot,
  findOwnedItem,
  consumeOwnedItem,
  rollChest,
  BattleResult,
  ActionType,
  Outcome,
} from '@arcane-familiars/game-logic';
import type { Bindings, Variables } from '../types';
import { commitBattleAndState, getOrCreateGameState } from '../utils/saveManager';
import { generateId } from '../utils/uuid';
import { internalError, readBody } from '../utils/http';
import { sanitizeBattleForClient, sanitizeStateForClient } from '../utils/sanitize';

const gameBattleRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Anti-farming: max completed battles (win or loss) per UTC calendar day per
// account (WS4 step 18). Fleeing does not count.
// Raised from 20 to 100 (2026-11-16): 20 cut sessions short now that runs are longer.
const MAX_BATTLES_PER_DAY = 100;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((nextMidnight - now.getTime()) / 1000);
}

// Roll the day if needed, then count this completed battle toward the cap.
function countCompletedBattle(state: GameState): void {
  const day = todayUtc();
  if (state.battlesDayUtc !== day) {
    state.battlesDayUtc = day;
    state.battlesToday = 0;
  }
  state.battlesToday = (state.battlesToday ?? 0) + 1;
}

/**
 * Level a newly joined familiar starts at: just below the enemy it came from,
 * so recruits are usable in the area where they were found. Never lowers an
 * existing level.
 */
function setJoinLevel(state: GameState, familiarId: string, sourceLevel: number): void {
  const joinLevel = Math.max(1, Math.min(MAX_FAMILIAR_LEVEL, Math.floor(sourceLevel) - BALANCE.recruitLevelOffset));
  state.familiarLevels ??= {};
  if ((state.familiarLevels[familiarId] ?? 1) < joinLevel) {
    state.familiarLevels[familiarId] = joinLevel;
  }
}

function cryptoSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function createBattleFamiliar(familiarId: string, level = 1, charm?: CharmRoll): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  const stats = applyCharm(scaleFamiliarStats(data.stats, level), charm);

  return {
    uid: generateId(),
    familiarData: { ...data, abilities: abilitiesAtLevel(data, level), stats },
    currentHp: stats.hp,
    currentMp: stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: false,
  };
}

// Backfill unique combatant ids for battles persisted before the uid field
// existed. Targeting relies on uid, so a missing uid would make results miss.
function ensureBattleUids(battle: BattleState): void {
  if (!battle.playerFamiliar.uid) battle.playerFamiliar.uid = generateId();
  if (!battle.enemyFamiliar.uid) battle.enemyFamiliar.uid = generateId();
}

function getPersistedResources(
  dungeon: GameState['dungeon'],
  familiarId: string,
  familiar: BattleFamiliar
): { currentHp: number; currentMp: number } {
  const maxHp = familiar.familiarData.stats.maxHp;
  const maxMp = familiar.familiarData.stats.maxMp;
  const hp = dungeon?.partyHp?.[familiarId];
  const mp = dungeon?.partyMp?.[familiarId];

  return {
    currentHp: typeof hp === 'number' && hp >= 0 ? Math.max(0, Math.min(hp, maxHp)) : familiar.familiarData.stats.hp,
    currentMp: typeof mp === 'number' && mp >= 0 ? Math.max(0, Math.min(mp, maxMp)) : familiar.familiarData.stats.mp,
  };
}

/**
 * Write a combatant's final HP/MP back into the dungeon's per-member resource
 * tables (voluntary swap-out, flee, end-of-turn persistence, KO relay).
 */
function persistCombatantResources(dungeon: GameState['dungeon'], familiar: BattleFamiliar): void {
  if (!dungeon) return;
  dungeon.partyHp[familiar.familiarData.id] = Math.max(0, familiar.currentHp);
  dungeon.partyMp[familiar.familiarData.id] = Math.max(0, familiar.currentMp);
}

/**
 * Build the ally combatant that enters battle for familiarId, seeded from the
 * resources persisted in the dungeon state. Shared by battle start, voluntary
 * swap-in, and the involuntary KO relay.
 */
function buildIncomingCombatant(
  dungeon: GameState['dungeon'],
  familiarId: string,
  level = 1,
  charm?: CharmRoll
): BattleFamiliar {
  const familiar = createBattleFamiliar(familiarId, level, charm);
  const resources = getPersistedResources(dungeon, familiarId, familiar);
  familiar.currentHp = resources.currentHp;
  familiar.currentMp = resources.currentMp;
  familiar.isAlly = true;
  return familiar;
}

function generateBattleRewards(rng: () => number): BattleRewards {
  const currency = 40 + Math.floor(rng() * 30);
  const items: string[] = [];

  if (rng() < 0.35) {
    items.push('potion_small');
  }

  return { currency, items };
}

/** Ability unlocks earned by a familiar that levelled from `fromLevel` to `toLevel`. */
function learnedAbilities(
  familiarId: string,
  fromLevel: number,
  toLevel: number
): NonNullable<BattleRewards['learned']> {
  if (toLevel <= fromLevel) return [];
  const species = getFamiliar(familiarId);
  if (!species) return [];

  return newlyLearned(species, fromLevel, toLevel).map((abilityId) => ({
    familiarId,
    familiarName: species.name,
    abilityId,
    abilityName: getAbility(abilityId)?.name ?? abilityId,
  }));
}

/** Passive tiers unlocked by a familiar that levelled from `fromLevel` to `toLevel`. */
function passiveUnlocks(
  familiarId: string,
  fromLevel: number,
  toLevel: number
): NonNullable<BattleRewards['passiveUnlocks']> {
  if (toLevel <= fromLevel) return [];
  const species = getFamiliar(familiarId);
  if (!species) return [];

  return newPassiveTiers(species, fromLevel, toLevel).map(({ id, tier }) => ({
    familiarId,
    familiarName: species.name,
    passiveId: id,
    passiveName: PASSIVES[id].name,
    tier,
  }));
}

/** Party-wide passives from the dungeon party (falling back to the active party). */
function battlePassives(state: GameState) {
  const dungeonParty = state.dungeon?.party ?? [];
  const ids = dungeonParty.length > 0 ? dungeonParty : (state.activeParty ?? []);
  return partyPassives(ids.map((id) => ({ familiarId: id, level: state.familiarLevels?.[id] ?? 1 })));
}

function relayInstinctDiscount(passives: ReturnType<typeof battlePassives>): number | undefined {
  return passives.find((passive) => passive.id === 'relayInstinct')?.value;
}

/**
 * Build the combatant that replaces the current one (manual swap or KO relay).
 * Once-per-battle passive effects are tracked per species on the battle, so a
 * familiar keeps a spent Second Wind when it returns, and each familiar gets
 * the Relay Instinct discount at most once per battle (otherwise a free swap
 * every turn would make abilities free).
 */
function swapInCombatant(battle: BattleState, state: GameState, familiarId: string): BattleFamiliar {
  const uses = (battle.passiveUses ??= { secondWind: [], relay: [] });
  const outgoing = battle.playerFamiliar;
  if (outgoing.secondWindUsed && !uses.secondWind.includes(outgoing.familiarData.id)) {
    uses.secondWind.push(outgoing.familiarData.id);
  }

  const incoming = buildIncomingCombatant(
    state.dungeon,
    familiarId,
    state.familiarLevels?.[familiarId] ?? 1,
    equippedCharm(state, familiarId)
  );
  if (uses.secondWind.includes(familiarId)) incoming.secondWindUsed = true;

  const discount = relayInstinctDiscount(battle.playerPassives ?? []);
  if (discount !== undefined && !uses.relay.includes(familiarId)) {
    incoming.relayDiscount = discount;
    uses.relay.push(familiarId);
  }
  return incoming;
}

gameBattleRouter.post('/game/battle/start', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; playerFamiliarId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, playerFamiliarId } = body;
    if (!anonymousId || !playerFamiliarId) {
      return c.json({ error: 'Missing required fields: anonymousId, playerFamiliarId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    const state = loaded.state;

    const activeBattle = await c.env.DB.prepare('SELECT battle_id FROM active_battles WHERE anonymous_id = ? LIMIT 1')
      .bind(anonymousId)
      .first<{ battle_id: string }>();
    if (activeBattle) {
      return c.json(
        {
          error: 'A battle is already active; resume or abandon it',
          code: 'BATTLE_ACTIVE',
          battleId: activeBattle.battle_id,
        },
        409
      );
    }

    // Daily battle cap: reject the start before any state/battle validation so
    // the 403 fires even against a minimal state (testable) and no battle row or
    // state write happens when the cap is exhausted.
    const today = todayUtc();
    const usedToday = state.battlesDayUtc === today ? (state.battlesToday ?? 0) : 0;
    if (usedToday >= MAX_BATTLES_PER_DAY) {
      return c.json(
        {
          error: `Daily battle limit reached (${MAX_BATTLES_PER_DAY}). Available again at ${today}T00:00:00Z`,
        },
        403,
        { 'Retry-After': String(secondsUntilUtcMidnight()) }
      );
    }

    const party = state.activeParty ?? [];
    if (!party.includes(playerFamiliarId) || !state.playerFamiliars.includes(playerFamiliarId)) {
      return c.json({ error: 'Familiar is not in your active party' }, 400);
    }

    const dungeon = state.dungeon;
    if (!dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    const room = dungeon.rooms[dungeon.currentRoomId];
    const pending = room?.pendingEncounter;

    if (!room || !pending || pending.resolved) {
      return c.json({ error: 'No enemy to fight in this room' }, 409);
    }

    const area = AREAS[dungeon.areaId];
    if (!area) {
      return c.json({ error: 'Invalid area' }, 500);
    }

    const playerFamiliar = buildIncomingCombatant(
      dungeon,
      playerFamiliarId,
      state.familiarLevels?.[playerFamiliarId] ?? 1,
      equippedCharm(state, playerFamiliarId)
    );
    if (playerFamiliar.currentHp <= 0) {
      return c.json(
        {
          error: 'That familiar has fainted; choose a living party member',
          code: 'FAMILIAR_FAINTED',
        },
        400
      );
    }

    // Enemy identity is derived from the persisted room encounter, never from the client.
    const enemyId = pending.enemyId;
    const baseEnemy = getFamiliar(enemyId);
    if (!baseEnemy) {
      return c.json({ error: 'Encounter references an unknown familiar' }, 500);
    }

    const battleSeed = cryptoSeed();

    // Non-boss levels were fixed when the encounter was rolled (explore), so
    // fleeing and re-starting cannot reroll enemy strength. Bosses sit at the
    // top of their area's level band and are scaled like any other enemy.
    const enemyLevel = baseEnemy.isBoss ? area.levelRange[1] : (pending.level ?? area.levelRange[0]);
    // Elites are normal encounters with one affix; bosses never roll one.
    const eliteId = baseEnemy.isBoss ? undefined : pending.elite;
    const scaledBase = scaleEnemy(baseEnemy, enemyLevel);
    const scaled = eliteId ? applyElite(scaledBase, eliteId) : scaledBase;
    const enemyFamiliar: BattleFamiliar = {
      uid: generateId(),
      familiarData: scaled,
      currentHp: scaled.stats.hp,
      currentMp: scaled.stats.mp,
      statusEffects: [],
      cooldowns: {},
      isAlly: false,
      ...(eliteId ? { elite: eliteId } : {}),
    };

    const battle: BattleState = {
      id: generateId(),
      roomId: dungeon.currentRoomId,
      playerFamiliar,
      enemyFamiliar,
      isBoss: baseEnemy.isBoss ?? false,
      enemyLevel,
      turnCount: 0,
      status: BattleResult.Active,
      swapsThisTurn: 0,
      seed: battleSeed,
      playerPassives: battlePassives(state),
    };

    // A battle row is created only after the active-battle guard above. Resume
    // and abandon are the only ways to clear an existing row; the route never
    // deletes a live battle to make room for a restart (which would restore HP).
    await c.env.DB.prepare(
      `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
      .bind(battle.id, anonymousId, JSON.stringify(battle))
      .run();

    return c.json({ battle: sanitizeBattleForClient(battle) });
  } catch (error: unknown) {
    return internalError(c, error, 'Start battle');
  }
});

gameBattleRouter.post('/game/battle/action', async (c) => {
  try {
    const body = await readBody<{
      anonymousId: string;
      battleId: string;
      action: BattleAction;
      expectedTurnCount?: number;
    }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, battleId, action, expectedTurnCount } = body;
    if (!anonymousId || !battleId || !action) {
      return c.json({ error: 'Missing required fields: anonymousId, battleId, action' }, 400);
    }

    const row = await c.env.DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ? AND anonymous_id = ?'
    )
      .bind(battleId, anonymousId)
      .first<{ battle_json: string }>();

    if (!row) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    const battle = JSON.parse(row.battle_json) as BattleState;
    ensureBattleUids(battle);
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, c.get('isGuest') ?? false);
    const state = loaded.state;
    // Battles persisted before passives existed get the party's current passives.
    battle.playerPassives ??= battlePassives(state);

    if (battle.status !== BattleResult.Active) {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (expectedTurnCount !== undefined && expectedTurnCount !== battle.turnCount) {
      return c.json({ error: 'Battle state is stale; please refresh and retry' }, 409);
    }

    const validation = validateBattleAction(action, battle, state.dungeon?.partyHp);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? 'Invalid action' }, 400);
    }

    if (action.type === ActionType.Run) {
      return c.json({ error: 'Use the flee endpoint to run from battle' }, 400);
    }

    if (action.type === ActionType.Ability && action.abilityId) {
      if (!battle.playerFamiliar.familiarData.abilities.includes(action.abilityId)) {
        return c.json({ error: 'Player familiar does not know this ability' }, 400);
      }
    }

    // Anti-farming re-check: the guard at start is check-then-act, so a player
    // at the cap could race `start` + `action` and let a battle that should
    // never have started commit a cap increment. Re-check before resolution so
    // the counter cannot exceed MAX_BATTLES_PER_DAY; a legitimate completion
    // (19 -> win -> 20) is unaffected because this runs before the increment.
    const today = todayUtc();
    const usedToday = state.battlesDayUtc === today ? (state.battlesToday ?? 0) : 0;
    if (usedToday >= MAX_BATTLES_PER_DAY) {
      return c.json(
        {
          error: `Daily battle limit reached (${MAX_BATTLES_PER_DAY}). Available again at ${today}T00:00:00Z`,
        },
        403,
        { 'Retry-After': String(secondsUntilUtcMidnight()) }
      );
    }

    // Validate items BEFORE resolution; actual consumption and state effects
    // happen after resolveTurn, only if the player's slot executed (a slower
    // actor can be KO'd before acting under speed-ordered turns).
    let stateEffectNote: string | undefined;
    let consumedItem: ItemData | undefined;
    let faintedPartyIds: string[] = [];
    if (action.type === ActionType.Item && action.itemId) {
      const owned = findOwnedItem(state, action.itemId);
      if (!owned) {
        return c.json({ error: 'You do not own this item' }, 400);
      }
      const item = getItem(action.itemId);
      if (!item) {
        return c.json({ error: 'Unknown item' }, 400);
      }

      // Validate state-level effects BEFORE consuming, so a failed use does
      // not eat the item.
      const revive = item.effects.find((e) => e.kind === 'revive_party');
      const fainted =
        revive && state.dungeon ? state.dungeon.party.filter((id) => (state.dungeon?.partyHp[id] ?? 0) <= 0) : [];
      if (revive && fainted.length === 0) {
        return c.json({ error: 'No fainted party members to revive' }, 400);
      }

      consumedItem = item;
      faintedPartyIds = fainted;
    }

    // Derive a per-turn RNG from the battle seed so each turn gets a distinct,
    // reproducible sequence (a fresh generator from the raw seed would repeat
    // the same rolls every turn).
    const rng = seededRandom((battle.seed ?? cryptoSeed()) ^ (battle.turnCount + 1));
    const enemyAction = selectEnemyAction(battle.enemyFamiliar, battle.playerFamiliar, rng);

    const {
      playerResult,
      enemyResult,
      updatedPlayerFamiliar,
      updatedEnemyFamiliar,
      steps: turnSteps,
      canceledActions,
    } = resolveTurn(action, battle.playerFamiliar, battle.enemyFamiliar, enemyAction, rng, battle.playerPassives ?? []);

    const playerActed = turnSteps.some((s) => s.actorUid === battle.playerFamiliar.uid);
    const enemyActed = turnSteps.some((s) => s.actorUid === battle.enemyFamiliar.uid);

    // Captured before the KO relay below can replace battle.playerFamiliar:
    // state-effect notes attach to the step of whoever acted this turn, even
    // when that actor did not survive it.
    const actingPlayerUid = battle.playerFamiliar.uid;

    // Consume the item and apply its state-level effects only if the player's
    // slot executed: a KO-canceled actor never used the item, so it must not
    // be eaten nor trigger revive_party/grant_currency. State-level effects:
    // applied here rather than in the battle engine, which only sees the two
    // active combatants.
    if (action.type === ActionType.Item && action.itemId && playerActed && consumedItem) {
      const consumed = consumeOwnedItem(state, action.itemId);
      if (!consumed) {
        return c.json({ error: 'You do not own this item' }, 400);
      }

      for (const effect of consumedItem.effects) {
        if (effect.kind === 'grant_currency') {
          state.inventory.currency += effect.value;
          stateEffectNote = `gains ${effect.value} currency`;
        }
        if (effect.kind === 'revive_party' && state.dungeon) {
          for (const id of faintedPartyIds) {
            const data = getFamiliar(id);
            if (data) {
              // Scale by the familiar's own level: reviving a levelled party
              // member to level-1 base HP would weaken it (and make the item
              // worse the more you invested in that familiar).
              const maxHp = scaleFamiliarStats(data.stats, state.familiarLevels?.[id] ?? 1).maxHp;
              state.dungeon.partyHp[id] = Math.max(1, Math.floor((maxHp * effect.percentage) / 100));
            }
          }
          stateEffectNote = `revives ${faintedPartyIds.length} party member${faintedPartyIds.length === 1 ? '' : 's'}`;
        }
      }
    }

    battle.playerFamiliar = updateCooldowns(
      updatedPlayerFamiliar,
      playerActed && action.type === ActionType.Ability ? action.abilityId : undefined
    );
    battle.enemyFamiliar = updateCooldowns(
      updatedEnemyFamiliar,
      enemyActed && enemyAction.type === ActionType.Ability ? enemyAction.abilityId : undefined
    );

    // Snapshot the turn count before mutating so the battle write below is
    // conditional on the exact row this turn was computed from.
    const turnBefore = battle.turnCount;
    battle.turnCount += 1;
    // A new turn begins: allow one free swap again (#10).
    battle.swapsThisTurn = 0;

    let outcome = checkBattleOutcome(battle.playerFamiliar, battle.enemyFamiliar);

    // Involuntary KO relay: when the active familiar falls but another living
    // party member remains, that member steps in instead of ending the run.
    // The engine's mutual-KO rule leaves the player alive at 1 HP, so a Loss
    // here always implies the enemy survived; without a living backup the Loss
    // falls through untouched to the dungeon-wipe branch below.
    let forcedSwap: ForcedSwapInfo | undefined;
    if (outcome === Outcome.Loss && state.dungeon) {
      const fallenId = battle.playerFamiliar.familiarData.id;
      const otherId = state.activeParty.find((id) => id !== fallenId);
      if (otherId !== undefined && getFamiliar(otherId) && (state.dungeon.partyHp[otherId] ?? 0) > 0) {
        persistCombatantResources(state.dungeon, battle.playerFamiliar);
        const incoming = swapInCombatant(battle, state, otherId);
        forcedSwap = {
          fallenName: battle.playerFamiliar.familiarData.name,
          incomingName: incoming.familiarData.name,
        };
        // Involuntary: replaces the fallen combatant without consuming the
        // once-per-turn free swap (swapsThisTurn stays as reset above).
        battle.playerFamiliar = incoming;
        outcome = Outcome.Continue;
      }
    }

    if (outcome === Outcome.Win) {
      battle.status = BattleResult.Won;
    } else if (outcome === Outcome.Loss) {
      battle.status = BattleResult.Lost;
    }

    let rewards: BattleRewards | undefined;
    let xpGained = 0;
    let levelUps = 0;
    let benchReward: Pick<BattleRewards, 'benchXp' | 'benchFamiliarId' | 'benchLevelUp'> | undefined;
    let learned: NonNullable<BattleRewards['learned']> = [];
    let passiveUnlockList: NonNullable<BattleRewards['passiveUnlocks']> = [];
    let lostLoot: ReturnType<typeof discardRunLoot> | undefined;
    if (outcome === Outcome.Win) {
      state.battleCount = (state.battleCount ?? 0) + 1;
      countCompletedBattle(state);
      state.winCount = (state.winCount ?? 0) + 1;

      const activeId = battle.playerFamiliar.familiarData.id;
      // XP is derived from the level the enemy was actually scaled to. Legacy
      // battles persisted before enemyLevel existed fall back to level 1.
      xpGained = battleXp(battle.enemyLevel ?? 1, battle.isBoss);
      // Elites are worth more XP (and, below, double coins plus a rare chest).
      if (battle.enemyFamiliar.elite && !battle.isBoss) {
        xpGained = Math.round(xpGained * BALANCE.eliteXpMultiplier);
      }
      state.familiarLevels ??= {};
      state.familiarXp ??= {};
      const activeLevelBefore = state.familiarLevels[activeId] ?? 1;
      const progress = applyFamiliarXp(activeLevelBefore, state.familiarXp[activeId] ?? 0, xpGained);
      state.familiarLevels[activeId] = progress.level;
      state.familiarXp[activeId] = progress.xp;
      levelUps = progress.levelsGained;
      learned = learned.concat(learnedAbilities(activeId, activeLevelBefore, progress.level));
      passiveUnlockList = passiveUnlockList.concat(passiveUnlocks(activeId, activeLevelBefore, progress.level));

      // The party member who did not land the winning blow still gains a
      // reduced share, so swapping/relaying does not starve the bench.
      const benchId = (state.activeParty ?? []).find((id) => id !== activeId);
      if (benchId) {
        const benchXp = Math.round(xpGained * BALANCE.benchXpShare);
        if (benchXp > 0) {
          const benchLevelBefore = state.familiarLevels[benchId] ?? 1;
          const benchProgress = applyFamiliarXp(benchLevelBefore, state.familiarXp[benchId] ?? 0, benchXp);
          state.familiarLevels[benchId] = benchProgress.level;
          state.familiarXp[benchId] = benchProgress.xp;
          learned = learned.concat(learnedAbilities(benchId, benchLevelBefore, benchProgress.level));
          passiveUnlockList = passiveUnlockList.concat(passiveUnlocks(benchId, benchLevelBefore, benchProgress.level));
          benchReward = {
            benchXp,
            benchFamiliarId: benchId,
            benchLevelUp: benchProgress.levelsGained,
          };
        }
      }

      // Resolve the room the battle was started in. A player cannot move during
      // a battle, but legacy battles persisted before roomId existed fall back
      // to the current room.
      const resolvedRoomId = resolveBattleRoomId(state.dungeon, battle);
      const room = resolvedRoomId && state.dungeon ? state.dungeon.rooms[resolvedRoomId] : undefined;
      if (room?.pendingEncounter) {
        room.pendingEncounter.resolved = true;
      }

      if (battle.isBoss) {
        const area = AREAS[state.dungeon?.areaId ?? ''];
        if (area) {
          const isFirstDefeat = !state.defeatedBosses.includes(area.bossId);
          if (isFirstDefeat) {
            state.defeatedBosses.push(area.bossId);
            // One-time reward: re-fighting a defeated boss does not farm
            // currency or items (the encounter can otherwise be re-entered).
            // The epic boss chest is part of that one-time reward.
            const bossChest = rollChest('epic', rng);
            const runLoot = getRunLoot(state.dungeon);
            runLoot.currency += area.bossReward.currency + bossChest.currency;
            for (const itemId of area.bossReward.items) {
              addInventoryItem(runLoot, itemId);
            }
            for (const itemId of bossChest.items) {
              addInventoryItem(runLoot, itemId);
            }
            if (bossChest.charm && state.dungeon) {
              (state.dungeon.runCharms ??= []).push({ ...bossChest.charm, uid: generateId() });
            }
            rewards = {
              currency: area.bossReward.currency,
              items: [...area.bossReward.items],
              bossChest,
            };
          }
          if (!state.playerFamiliars.includes(area.baseFamiliar)) {
            state.playerFamiliars.push(area.baseFamiliar);
            // The boss's gift joins at a level that is useful where it was earned.
            setJoinLevel(state, area.baseFamiliar, area.levelRange[1]);
          }
          if (area.unlocks && !state.unlockedAreas.includes(area.unlocks)) {
            state.unlockedAreas.push(area.unlocks);
          }
        }
        // A boss clear ends the run; bank everything found plus the boss reward.
        bankRunLoot(state);
        state.dungeon = null;
      } else {
        const battleRewards = generateBattleRewards(rng);
        // Elite victories pay double coins and a rare chest. The chest and its
        // charm are banked with the run loot exactly like the boss chest.
        if (battle.enemyFamiliar.elite) {
          battleRewards.currency *= 2;
          const eliteChest = rollChest('rare', rng);
          battleRewards.eliteChest = eliteChest;
          const eliteLoot = getRunLoot(state.dungeon);
          for (const itemId of eliteChest.items) {
            addInventoryItem(eliteLoot, itemId);
          }
          eliteLoot.currency += eliteChest.currency;
          if (eliteChest.charm && state.dungeon) {
            (state.dungeon.runCharms ??= []).push({ ...eliteChest.charm, uid: generateId() });
          }
        }
        rewards = battleRewards;
        const runLoot = getRunLoot(state.dungeon);
        runLoot.currency += battleRewards.currency;
        for (const itemId of battleRewards.items) {
          addInventoryItem(runLoot, itemId);
        }

        // Non-boss victories can recruit the defeated species. Rarer species
        // are less likely; already-owned species and bosses are skipped. Wins
        // also build bond, so a guaranteed recruit eventually follows unlucky
        // runs instead of leaving it purely to chance.
        const species = getFamiliar(battle.enemyFamiliar.familiarData.id);
        if (species && !species.isBoss && !state.playerFamiliars.includes(species.id)) {
          const recruit = applyRecruitWin(state, species.id, rng());
          if (recruit.recruited) {
            setJoinLevel(state, species.id, battle.enemyLevel ?? 1);
            battleRewards.recruitedFamiliar = species.id;
            battleRewards.recruitedName = species.name;
            battleRewards.recruitedLevel = state.familiarLevels?.[species.id] ?? 1;
            if (state.dungeon) {
              state.dungeon.runRecruits = [...(state.dungeon.runRecruits ?? []), species.id];
            }
          } else {
            battleRewards.recruitProgress = {
              familiarId: species.id,
              name: species.name,
              bond: recruit.bond,
              needed: recruit.needed,
            };
          }
        }

        if (state.dungeon) {
          persistCombatantResources(state.dungeon, battle.playerFamiliar);
        }
      }
    } else if (outcome === Outcome.Loss) {
      state.battleCount = (state.battleCount ?? 0) + 1;
      countCompletedBattle(state);
      // The run's loot is lost; the banked inventory is untouched.
      lostLoot = discardRunLoot(state);
      state.dungeon = null;
    } else {
      if (state.dungeon) {
        persistCombatantResources(state.dungeon, battle.playerFamiliar);
      }
    }

    if (xpGained > 0) {
      const xpReward = {
        xp: xpGained,
        levelUp: levelUps,
        ...benchReward,
        ...(learned.length > 0 ? { learned } : {}),
        ...(passiveUnlockList.length > 0 ? { passiveUnlocks: passiveUnlockList } : {}),
      };
      rewards = rewards ? { ...rewards, ...xpReward } : { currency: 0, items: [], ...xpReward };
    }

    const turnResult: BattleTurnResult = {
      playerAction: playerResult,
      enemyAction: enemyResult,
      playerFamiliar: battle.playerFamiliar,
      enemyFamiliar: battle.enemyFamiliar,
      battleOutcome: outcome,
      rewards,
      lostLoot,
      steps: turnSteps,
      canceledActions,
      forcedSwap,
    };

    // State-level item effects resolve outside the engine; surface them in
    // the same log line the player already reads. Appending via the step's
    // result also updates the compat field, which references the same object
    // when the player executed.
    if (stateEffectNote) {
      const playerStep = turnResult.steps.find((s) => s.actorUid === actingPlayerUid);
      if (playerStep) {
        playerStep.result.description += ` (${stateEffectNote})`;
      }
    }

    // Atomic: state + battle writes must succeed or fail together. The battle
    // statement runs first, guarded by the state version read above; the state
    // statement is guarded by the same version plus the post-write battle shape.
    // A 0-row match on either therefore forces a 0-row match on the other (D1
    // batch does not roll back 0-row matches on its own).
    const newBattleJson = JSON.stringify(battle);
    const battleWrite =
      outcome !== Outcome.Continue
        ? {
            sql: `DELETE FROM active_battles
                    WHERE battle_id = ? AND anonymous_id = ?
                      AND json_extract(battle_json, '$.turnCount') = ?`,
            params: [battleId, anonymousId, turnBefore],
          }
        : {
            sql: `UPDATE active_battles
                    SET battle_json = ?, updated_at = datetime('now')
                    WHERE battle_id = ? AND anonymous_id = ?
                      AND json_extract(battle_json, '$.turnCount') = ?`,
            params: [newBattleJson, battleId, anonymousId, turnBefore],
          };
    const postBattle =
      outcome !== Outcome.Continue
        ? {
            sql: 'NOT EXISTS (SELECT 1 FROM active_battles WHERE battle_id = ? AND anonymous_id = ?)',
            params: [battleId, anonymousId],
          }
        : {
            sql: `EXISTS (SELECT 1 FROM active_battles
                           WHERE battle_id = ? AND anonymous_id = ? AND battle_json = ?)`,
            params: [battleId, anonymousId, newBattleJson],
          };

    const committed = await commitBattleAndState(c.env.DB, {
      anonymousId,
      expectedVersion: loaded.version,
      state,
      battle: battleWrite,
      postBattle,
    });
    if (!committed) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ turnResult, state: sanitizeStateForClient(state), turnCount: battle.turnCount });
  } catch (error: unknown) {
    return internalError(c, error, 'Battle action');
  }
});

gameBattleRouter.post('/game/battle/swap', async (c) => {
  try {
    const body = await readBody<{
      anonymousId: string;
      battleId: string;
      newFamiliarId: string;
      expectedTurnCount?: number;
    }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, battleId, newFamiliarId, expectedTurnCount } = body;
    if (!anonymousId || !battleId || !newFamiliarId) {
      return c.json({ error: 'Missing required fields: anonymousId, battleId, newFamiliarId' }, 400);
    }

    const row = await c.env.DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ? AND anonymous_id = ?'
    )
      .bind(battleId, anonymousId)
      .first<{ battle_json: string }>();

    if (!row) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    const battle = JSON.parse(row.battle_json) as BattleState;
    ensureBattleUids(battle);
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, c.get('isGuest') ?? false);

    if (battle.status !== BattleResult.Active) {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (expectedTurnCount !== undefined && expectedTurnCount !== battle.turnCount) {
      return c.json({ error: 'Battle state is stale; please refresh and retry' }, 409);
    }

    if (newFamiliarId === battle.playerFamiliar.familiarData.id) {
      return c.json({ error: 'Already using this familiar' }, 400);
    }

    // Only one free swap per turn (#10).
    if ((battle.swapsThisTurn ?? 0) >= 1) {
      return c.json({ error: 'You can only swap once per turn' }, 400);
    }

    const state = loaded.state;
    battle.playerPassives ??= battlePassives(state);

    const party = state.activeParty ?? [];
    if (!party.includes(newFamiliarId)) {
      return c.json({ error: 'Familiar is not in your active party' }, 400);
    }

    // A KO'd backup cannot be swapped into; this returns before any mutation,
    // so swapsThisTurn is not consumed by the rejected request.
    if ((state.dungeon?.partyHp[newFamiliarId] ?? 0) <= 0) {
      return c.json({ error: 'Cannot swap to a fainted familiar' }, 400);
    }

    // Snapshot the fields the swap changes so the battle write can be
    // conditional on the exact row this swap was computed from. turnCount does
    // not change on a swap, so it cannot be the concurrency token here.
    const previousFamiliarId = battle.playerFamiliar.familiarData.id;
    const previousSwaps = battle.swapsThisTurn ?? 0;

    persistCombatantResources(state.dungeon, battle.playerFamiliar);
    battle.playerFamiliar = swapInCombatant(battle, state, newFamiliarId);
    battle.swapsThisTurn = previousSwaps + 1;

    // See the action route: battle first (guarded by the state version), then
    // the state write (guarded by the version AND the post-write battle row), so
    // the two statements are all-or-nothing.
    const newBattleJson = JSON.stringify(battle);
    const committed = await commitBattleAndState(c.env.DB, {
      anonymousId,
      expectedVersion: loaded.version,
      state,
      battle: {
        sql: `UPDATE active_battles
                SET battle_json = ?, updated_at = datetime('now')
                WHERE battle_id = ? AND anonymous_id = ?
                  AND COALESCE(json_extract(battle_json, '$.swapsThisTurn'), 0) = ?
                  AND json_extract(battle_json, '$.playerFamiliar.familiarData.id') = ?`,
        params: [newBattleJson, battleId, anonymousId, previousSwaps, previousFamiliarId],
      },
      postBattle: {
        sql: `EXISTS (SELECT 1 FROM active_battles
                       WHERE battle_id = ? AND anonymous_id = ? AND battle_json = ?)`,
        params: [battleId, anonymousId, newBattleJson],
      },
    });
    if (!committed) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ battle: sanitizeBattleForClient(battle) });
  } catch (error: unknown) {
    return internalError(c, error, 'Swap familiar');
  }
});

gameBattleRouter.post('/game/battle/flee', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; battleId: string; expectedTurnCount?: number }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, battleId, expectedTurnCount } = body;
    if (!anonymousId || !battleId) {
      return c.json({ error: 'Missing required fields: anonymousId, battleId' }, 400);
    }

    const row = await c.env.DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ? AND anonymous_id = ?'
    )
      .bind(battleId, anonymousId)
      .first<{ battle_json: string }>();

    if (!row) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    const battle = JSON.parse(row.battle_json) as BattleState;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, c.get('isGuest') ?? false);

    if (battle.status !== BattleResult.Active) {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (expectedTurnCount !== undefined && expectedTurnCount !== battle.turnCount) {
      return c.json({ error: 'Battle state is stale; please refresh and retry' }, 409);
    }

    if (battle.isBoss) {
      return c.json({ error: 'Cannot flee from a boss battle' }, 400);
    }

    battle.status = BattleResult.Fled;

    const state = loaded.state;

    persistCombatantResources(state.dungeon, battle.playerFamiliar);

    const committed = await commitBattleAndState(c.env.DB, {
      anonymousId,
      expectedVersion: loaded.version,
      state,
      battle: {
        sql: `DELETE FROM active_battles
                WHERE battle_id = ? AND anonymous_id = ?
                  AND json_extract(battle_json, '$.turnCount') = ?`,
        params: [battleId, anonymousId, battle.turnCount],
      },
      postBattle: {
        sql: 'NOT EXISTS (SELECT 1 FROM active_battles WHERE battle_id = ? AND anonymous_id = ?)',
        params: [battleId, anonymousId],
      },
    });
    if (!committed) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, message: 'Successfully fled from battle', battle: sanitizeBattleForClient(battle) });
  } catch (error: unknown) {
    return internalError(c, error, 'Flee battle');
  }
});

gameBattleRouter.post('/game/battle/abandon', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; battleId: string; expectedTurnCount: number }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, battleId, expectedTurnCount } = body;
    if (!anonymousId || !battleId) {
      return c.json({ error: 'Missing required fields: anonymousId, battleId' }, 400);
    }
    if (typeof expectedTurnCount !== 'number') {
      return c.json({ error: 'Missing required field: expectedTurnCount' }, 400);
    }

    const row = await c.env.DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ? AND anonymous_id = ?'
    )
      .bind(battleId, anonymousId)
      .first<{ battle_json: string }>();

    if (!row) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    const battle = JSON.parse(row.battle_json) as BattleState;
    if (expectedTurnCount !== battle.turnCount) {
      return c.json({ error: 'Battle state is stale; please refresh and retry' }, 409);
    }

    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, c.get('isGuest') ?? false);
    const state = loaded.state;

    // Persist the active combatant's attrition. A non-boss abandon leaves the
    // room's encounter unresolved (same as flee); a boss abandon forfeits the
    // run. Run-loot penalties land with the run lifecycle work.
    persistCombatantResources(state.dungeon, battle.playerFamiliar);
    const forfeited = battle.isBoss;
    let lostLoot: ReturnType<typeof discardRunLoot> | undefined;
    if (forfeited) {
      lostLoot = discardRunLoot(state);
      state.dungeon = null;
    }

    const committed = await commitBattleAndState(c.env.DB, {
      anonymousId,
      expectedVersion: loaded.version,
      state,
      battle: {
        sql: `DELETE FROM active_battles
                WHERE battle_id = ? AND anonymous_id = ?
                  AND json_extract(battle_json, '$.turnCount') = ?`,
        params: [battleId, anonymousId, battle.turnCount],
      },
      postBattle: {
        sql: 'NOT EXISTS (SELECT 1 FROM active_battles WHERE battle_id = ? AND anonymous_id = ?)',
        params: [battleId, anonymousId],
      },
    });
    if (!committed) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, state: sanitizeStateForClient(state), forfeited, lostLoot });
  } catch (error: unknown) {
    return internalError(c, error, 'Abandon battle');
  }
});

export default gameBattleRouter;
