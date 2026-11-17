import { Hono } from 'hono';
import type { CharmInstance, ChestTier, CurioGains, GameState, RunSummary } from '@arcane-familiars/game-logic';
import {
  AREAS,
  BALANCE,
  CURIOS,
  ELITE_IDS,
  generateDungeon,
  rollEncounter,
  rollRoomTreasure,
  roomRollSeed,
  selectEnemy,
  eliteChanceForRoom,
  isEliteRoom,
  eliteName as formatEliteName,
  getFamiliar,
  getItem,
  getAbility,
  PASSIVES,
  healPartyAtRest,
  seededRandom,
  randomInRange,
  RoomType,
  validateDungeonExplore,
  validateParty,
  scaleFamiliarStats,
  isNewPlayer,
  getRunLoot,
  getRunStats,
  buildRunSummary,
  addInventoryItem,
  bankRunLoot,
  findOwnedItem,
  consumeOwnedItem,
  applyFamiliarXp,
  catchUpXpMultiplier,
  newlyLearned,
  newPassiveTiers,
  resolveCurioOption,
  rollChest,
  dailyExpedition,
} from '@arcane-familiars/game-logic';
import type { EliteId } from '@arcane-familiars/game-logic';
import type { Bindings, Variables } from '../types';
import { getOrCreateGameState, hasActiveBattle, saveGameStateIfVersionNoBattle } from '../utils/saveManager';
import { internalError, readBody } from '../utils/http';
import { generateId } from '../utils/uuid';
import { sanitizeDungeonForClient, sanitizeStateForClient } from '../utils/sanitize';

const explorationRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Sent when a dungeon mutation is attempted while an active_battles row exists.
// The write itself is also guarded (saveGameStateIfVersionNoBattle), so this is
// the clear-error half of the guard; the write-time half closes the race where a
// battle starts between this check and the write.
const ACTIVE_BATTLE_ERROR = 'Cannot change dungeon state during an active battle';

function cryptoSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

explorationRouter.post('/game/dungeon/enter', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; areaId?: string; daily?: boolean }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, areaId: requestedAreaId, daily } = body;
    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }
    if (daily !== true && !requestedAreaId) {
      return c.json({ error: 'Missing required fields: anonymousId, areaId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    const state = loaded.state;
    const today = todayUtc();

    let areaId: string;
    let seed: number;
    if (daily === true) {
      const expedition = dailyExpedition(today, state.unlockedAreas);
      areaId = expedition.areaId;
      seed = expedition.seed;
    } else {
      areaId = requestedAreaId as string;
      const requested = AREAS[areaId];
      if (!requested) {
        return c.json({ error: 'Invalid area id' }, 400);
      }
      seed = cryptoSeed();
    }

    const area = AREAS[areaId];
    if (!area) {
      return c.json({ error: 'Invalid area id' }, 400);
    }

    if (!state.unlockedAreas.includes(areaId)) {
      return c.json({ error: 'Area is not unlocked' }, 403);
    }

    if (state.dungeon) {
      return c.json({ error: 'Already in a dungeon' }, 409);
    }

    const partyValidation = validateParty(state.activeParty, state.playerFamiliars);
    if (!partyValidation.valid) {
      return c.json({ error: partyValidation.error ?? 'Party is invalid' }, 400);
    }

    const dungeon = generateDungeon(area, seed);
    if (daily === true) {
      dungeon.daily = today;
      // The date seed fixes the shared layout (rooms, branches, curio spots).
      // Per-room rolls (encounters, chests, curio outcomes) use a fresh seed per
      // entry, so retreating and re-entering cannot farm a known chest.
      dungeon.seed = cryptoSeed();
    }
    dungeon.party = [...state.activeParty];
    for (const familiarId of dungeon.party) {
      const familiar = getFamiliar(familiarId);
      if (familiar) {
        const stats = scaleFamiliarStats(familiar.stats, state.familiarLevels?.[familiarId] ?? 1);
        dungeon.partyHp[familiarId] = stats.hp;
        dungeon.partyMp[familiarId] = stats.mp;
      }
    }

    state.dungeon = dungeon;

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ dungeon: sanitizeDungeonForClient(dungeon), area });
  } catch (error: unknown) {
    return internalError(c, error, 'Enter dungeon');
  }
});

explorationRouter.post('/game/dungeon/explore', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; roomId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, roomId } = body;
    if (!anonymousId || !roomId) {
      return c.json({ error: 'Missing required fields: anonymousId, roomId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    const state = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: ACTIVE_BATTLE_ERROR }, 409);
    }

    if (!state.dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    const moveValidation = validateDungeonExplore(roomId, state.dungeon);
    if (!moveValidation.valid) {
      return c.json({ error: moveValidation.error ?? 'Cannot explore that room' }, 400);
    }

    const room = state.dungeon.rooms[roomId];
    if (!room) {
      return c.json({ error: 'Room not found' }, 404);
    }

    const area = AREAS[state.dungeon.areaId];
    if (!area) {
      return c.json({ error: 'Invalid area' }, 500);
    }

    state.dungeon.currentRoomId = roomId;

    let encounter = false;
    let enemy: string | null = null;
    let treasure = false;
    let treasureItem: string | null = null;
    let treasureTier: ChestTier | undefined;
    let treasureItems: string[] | undefined;
    let treasureCurrency: number | undefined;
    let rest: { healed: Record<string, { hp: number; mp: number }> } | undefined;
    let elite: EliteId | undefined;
    let eliteName: string | undefined;

    if (room.cleared) {
      // Re-entering a cleared room: replay the persisted outcome, never re-roll.
      if (room.pendingEncounter && !room.pendingEncounter.resolved) {
        encounter = true;
        enemy = room.pendingEncounter.enemyId;
        if (room.pendingEncounter.elite) {
          elite = room.pendingEncounter.elite;
          const base = getFamiliar(room.pendingEncounter.enemyId);
          if (base) eliteName = formatEliteName(base.name, elite);
        }
      }
      if (room.pendingTreasure && !room.pendingTreasure.looted) {
        treasure = true;
        treasureItem = room.pendingTreasure.itemId;
        treasureTier = room.pendingTreasure.tier;
        treasureItems = room.pendingTreasure.items ?? [room.pendingTreasure.itemId];
        treasureCurrency = room.pendingTreasure.currency ?? 0;
      }
    } else {
      room.cleared = true;
      getRunStats(state.dungeon).roomsExplored += 1;

      const rng = seededRandom(roomRollSeed(state.dungeon.seed ?? 0, roomId));
      // New players get a gentle first fight, and elites stay locked until the
      // win gate is met. Both rules override outcomes but never change how many
      // rng draws a room consumes, so a given seed keeps its layout.
      const newPlayer = isNewPlayer(state);
      const eliteUnlocked = (state.winCount ?? 0) >= BALANCE.eliteMinWins;

      if (room.type === RoomType.Boss) {
        encounter = true;
        enemy = area.bossId;
        room.pendingEncounter = { enemyId: area.bossId, resolved: false };
      } else {
        if (rollEncounter(room, rng)) {
          const selectedEnemy = selectEnemy(area, rng);
          if (selectedEnemy) {
            encounter = true;
            enemy = selectedEnemy;
            // Persist the scaled level so fleeing and re-entering cannot reroll
            // enemy strength for the same encounter. The roll is still drawn for
            // a new player (then overridden) so later rolls do not shift.
            const rolledLevel = randomInRange(rng, area.levelRange[0], area.levelRange[1]);
            const level = newPlayer ? area.levelRange[0] : rolledLevel;
            room.pendingEncounter = { enemyId: selectedEnemy, resolved: false, level };
          }
        }
      }

      // Treasure is rolled independently of the encounter: a guarded chest is
      // still lootable once the fight is won (collect-treasure enforces that).
      const rolled = rollRoomTreasure(room, rng);
      if (rolled && rolled.items.length > 0) {
        treasure = true;
        treasureItem = rolled.items[0];
        treasureTier = rolled.tier;
        treasureItems = rolled.items;
        treasureCurrency = rolled.currency;
        room.pendingTreasure = {
          itemId: rolled.items[0],
          looted: false,
          tier: rolled.tier,
          items: rolled.items,
          currency: rolled.currency,
          ...(rolled.charm ? { charm: rolled.charm } : {}),
        };
      }

      // Elite roll: after the existing encounter/treasure rolls so those stay
      // identical for a given seed. Never bosses, the entrance or room_1, and
      // never before the win gate. The elite-id draw is consumed even when the
      // gate blocks the pickup, so the rng sequence matches the ungated code.
      if (encounter && room.pendingEncounter && isEliteRoom(room)) {
        const eliteRollPassed = rng() < eliteChanceForRoom(room, area);
        if (eliteRollPassed) {
          const eliteId = ELITE_IDS[randomInRange(rng, 0, ELITE_IDS.length - 1)];
          if (eliteUnlocked) {
            room.pendingEncounter.elite = eliteId;
            elite = eliteId;
            const base = getFamiliar(room.pendingEncounter.enemyId);
            if (base) eliteName = formatEliteName(base.name, eliteId);
          }
        }
      }
    }

    // First visit to a rest shrine restores part of every living party member's
    // level-scaled HP/MP. `rested` makes it one-time per run; later visits are
    // silent no-ops. Fainted members (hp <= 0) are not revived.
    if (room.type === RoomType.Rest && !room.rested) {
      rest = { healed: healPartyAtRest(state.dungeon, state.familiarLevels) };
      room.rested = true;
    }

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({
      room,
      encounter,
      enemy,
      treasure,
      treasureItem,
      ...(treasure ? { treasureTier, treasureItems, treasureCurrency } : {}),
      ...(rest ? { rest } : {}),
      ...(elite ? { elite, eliteName } : {}),
    });
  } catch (error: unknown) {
    return internalError(c, error, 'Explore room');
  }
});

explorationRouter.post('/game/dungeon/collect-treasure', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; roomId: string; itemId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, roomId, itemId } = body;
    if (!anonymousId || !roomId || !itemId) {
      return c.json({ error: 'Missing required fields: anonymousId, roomId, itemId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    const state = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: ACTIVE_BATTLE_ERROR }, 409);
    }

    if (!state.dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    if (roomId !== state.dungeon.currentRoomId) {
      return c.json({ error: 'You are not in that room' }, 400);
    }

    const room = state.dungeon.rooms[roomId];
    if (!room) {
      return c.json({ error: 'Room not found' }, 404);
    }

    const pending = room.pendingTreasure;
    if (!pending) {
      return c.json({ error: 'This room holds no treasure' }, 400);
    }
    if (pending.looted) {
      return c.json({ error: 'Treasure has already been collected' }, 400);
    }
    if (pending.itemId !== itemId) {
      return c.json({ error: 'Treasure does not match the requested item' }, 400);
    }
    if (room.pendingEncounter && !room.pendingEncounter.resolved) {
      return c.json({ error: 'Clear the encounter before collecting treasure' }, 400);
    }

    pending.looted = true;
    getRunStats(state.dungeon).chestsOpened += 1;

    // Treasure is run loot, not banked inventory. It is usable during the run
    // and is lost on defeat; exiting or winning banks it.
    const runLoot = getRunLoot(state.dungeon);
    for (const id of pending.items ?? [itemId]) {
      addInventoryItem(runLoot, id);
    }
    runLoot.currency += pending.currency ?? 0;

    // The charm rolled with the chest joins the run's separate charm ledger;
    // it banks or is lost with the rest of the run loot.
    let charm: CharmInstance | undefined;
    if (pending.charm) {
      charm = { ...pending.charm, uid: generateId() };
      (state.dungeon.runCharms ??= []).push(charm);
    }

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, inventory: state.inventory, runLoot, ...(charm ? { charm } : {}) });
  } catch (error: unknown) {
    return internalError(c, error, 'Collect treasure');
  }
});

explorationRouter.post('/game/dungeon/curio', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; roomId: string; optionId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, roomId, optionId } = body;
    if (!anonymousId || !roomId || !optionId) {
      return c.json({ error: 'Missing required fields: anonymousId, roomId, optionId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    const state = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: ACTIVE_BATTLE_ERROR }, 409);
    }

    const dungeon = state.dungeon;
    if (!dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    if (roomId !== dungeon.currentRoomId) {
      return c.json({ error: 'You are not in that room' }, 400);
    }

    const room = dungeon.rooms[roomId];
    if (!room) {
      return c.json({ error: 'Room not found' }, 404);
    }

    // Optional field: rooms generated before curios existed simply have none.
    const placed = room.curio;
    if (!placed) {
      return c.json({ error: 'This room holds no curio' }, 400);
    }
    if (placed.used) {
      return c.json({ error: 'This curio has already been used' }, 400);
    }

    const curio = CURIOS[placed.id];
    if (!curio) {
      return c.json({ error: 'Unknown curio' }, 400);
    }

    const option = curio.options.find((entry) => entry.id === optionId);
    if (!option) {
      return c.json({ error: 'Unknown curio option' }, 400);
    }

    if (room.pendingEncounter && !room.pendingEncounter.resolved) {
      return c.json({ error: 'Clear the encounter before using the curio' }, 400);
    }

    const area = AREAS[dungeon.areaId];
    if (!area) {
      return c.json({ error: 'Invalid area' }, 500);
    }

    // Requirements are checked before any cost is paid or state mutated.
    if (option.requiresItem && !findOwnedItem(state, option.requiresItem)) {
      const itemName = getItem(option.requiresItem)?.name ?? option.requiresItem;
      return c.json({ error: `You need a ${itemName}` }, 400);
    }

    const runLoot = getRunLoot(dungeon);
    if (option.costCurrency && runLoot.currency + state.inventory.currency < option.costCurrency) {
      return c.json({ error: `You need ${option.costCurrency} coins` }, 400);
    }

    // Pay costs: run loot first, then the bank.
    if (option.requiresItem) {
      consumeOwnedItem(state, option.requiresItem);
    }
    if (option.costCurrency) {
      const fromRun = Math.min(runLoot.currency, option.costCurrency);
      runLoot.currency -= fromRun;
      state.inventory.currency -= option.costCurrency - fromRun;
    }

    // Deterministic per dungeon seed + room: reloading cannot reroll the result.
    const rng = seededRandom(roomRollSeed(dungeon.seed ?? 0, `${roomId}:curio`));
    const resolution = resolveCurioOption(curio, optionId, rng);
    if (!resolution) {
      return c.json({ error: 'Unknown curio option' }, 400);
    }

    const { outcome, text } = resolution;
    const gains: CurioGains = {};
    const runStats = getRunStats(dungeon);
    let ambushEnemy: string | undefined;

    const living = (dungeon.party ?? []).filter((id) => (dungeon.partyHp[id] ?? 0) > 0);

    switch (outcome.kind) {
      case 'healParty': {
        const healed: Record<string, { hp: number; mp: number }> = {};
        for (const familiarId of living) {
          const base = getFamiliar(familiarId);
          if (!base) continue;
          const stats = scaleFamiliarStats(base.stats, state.familiarLevels?.[familiarId] ?? 1);
          const currentHp = dungeon.partyHp[familiarId] ?? 0;
          const currentMp = dungeon.partyMp[familiarId] ?? 0;
          const hp = Math.max(0, Math.min(stats.maxHp - currentHp, Math.round((stats.maxHp * outcome.hpPct) / 100)));
          const mp = Math.max(0, Math.min(stats.maxMp - currentMp, Math.round((stats.maxMp * outcome.mpPct) / 100)));
          dungeon.partyHp[familiarId] = currentHp + hp;
          dungeon.partyMp[familiarId] = currentMp + mp;
          if (hp > 0 || mp > 0) healed[familiarId] = { hp, mp };
        }
        gains.healed = healed;
        break;
      }
      case 'hurtParty': {
        // Hurt never KOs: every living member floors at 1 HP.
        const hurt: Record<string, number> = {};
        for (const familiarId of living) {
          const base = getFamiliar(familiarId);
          if (!base) continue;
          const stats = scaleFamiliarStats(base.stats, state.familiarLevels?.[familiarId] ?? 1);
          const currentHp = dungeon.partyHp[familiarId] ?? 0;
          const damage = Math.max(1, Math.round((stats.maxHp * outcome.hpPct) / 100));
          const nextHp = Math.max(1, currentHp - damage);
          dungeon.partyHp[familiarId] = nextHp;
          hurt[familiarId] = currentHp - nextHp;
        }
        gains.hurt = hurt;
        break;
      }
      case 'chest': {
        const chest = rollChest(outcome.tier, rng);
        for (const itemId of chest.items) {
          addInventoryItem(runLoot, itemId);
        }
        runLoot.currency += chest.currency;
        runStats.chestsOpened += 1;
        gains.items = chest.items;
        gains.currency = chest.currency;
        if (chest.charm) {
          (dungeon.runCharms ??= []).push({ ...chest.charm, uid: generateId() });
          gains.charms = [chest.charm];
        }
        break;
      }
      case 'coins': {
        const amount = randomInRange(rng, outcome.min, outcome.max);
        runLoot.currency += amount;
        gains.currency = amount;
        break;
      }
      case 'xp': {
        state.familiarLevels ??= {};
        state.familiarXp ??= {};
        const levels: NonNullable<CurioGains['levels']> = [];
        const learned: NonNullable<CurioGains['learned']> = [];
        const passiveUnlocks: NonNullable<CurioGains['passiveUnlocks']> = [];
        const highestLevel = Math.max(1, ...(state.playerFamiliars ?? []).map((id) => state.familiarLevels?.[id] ?? 1));

        for (const familiarId of living) {
          const base = getFamiliar(familiarId);
          if (!base) continue;
          const levelBefore = state.familiarLevels[familiarId] ?? 1;
          const multiplier = catchUpXpMultiplier(levelBefore, highestLevel);
          const xpAmount = Math.round(outcome.amount * multiplier);
          const progress = applyFamiliarXp(levelBefore, state.familiarXp[familiarId] ?? 0, xpAmount);
          state.familiarLevels[familiarId] = progress.level;
          state.familiarXp[familiarId] = progress.xp;
          runStats.xpByFamiliar[familiarId] = (runStats.xpByFamiliar[familiarId] ?? 0) + xpAmount;
          runStats.levelsByFamiliar[familiarId] = (runStats.levelsByFamiliar[familiarId] ?? 0) + progress.levelsGained;
          levels.push({
            familiarId,
            name: base.name,
            level: progress.level,
            levelsGained: progress.levelsGained,
            xp: xpAmount,
            ...(multiplier > 1 ? { catchUp: true } : {}),
          });

          if (progress.levelsGained > 0) {
            learned.push(
              ...newlyLearned(base, levelBefore, progress.level).map((abilityId) => ({
                familiarId,
                familiarName: base.name,
                abilityId,
                abilityName: getAbility(abilityId)?.name ?? abilityId,
              }))
            );
            passiveUnlocks.push(
              ...newPassiveTiers(base, levelBefore, progress.level).map(({ id: passiveId, tier }) => ({
                familiarId,
                familiarName: base.name,
                passiveId,
                passiveName: PASSIVES[passiveId].name,
                tier,
              }))
            );
          }
        }

        gains.xp = outcome.amount;
        gains.levels = levels;
        if (learned.length > 0) gains.learned = learned;
        if (passiveUnlocks.length > 0) gains.passiveUnlocks = passiveUnlocks;
        for (const entry of learned) {
          runStats.learned.push(`${entry.familiarName} learned ${entry.abilityName}`);
        }
        for (const entry of passiveUnlocks) {
          runStats.passiveUnlocks.push(`${entry.familiarName} unlocked ${entry.passiveName}`);
        }
        break;
      }
      case 'bond': {
        const candidates = area.encounterPool.filter((speciesId) => {
          const species = getFamiliar(speciesId);
          return species && !species.isBoss && !state.playerFamiliars.includes(speciesId);
        });

        if (candidates.length === 0) {
          // Nothing left to bond with here: the curio pays out in coins instead.
          const amount = randomInRange(rng, 20, 40);
          runLoot.currency += amount;
          gains.currency = amount;
        } else {
          const speciesId = candidates[randomInRange(rng, 0, candidates.length - 1)];
          const species = getFamiliar(speciesId);
          if (species) {
            state.recruitBond ??= {};
            const bond = (state.recruitBond[speciesId] ?? 0) + outcome.amount;
            state.recruitBond[speciesId] = bond;
            runStats.bondGains[speciesId] = (runStats.bondGains[speciesId] ?? 0) + outcome.amount;
            gains.bond = {
              speciesId,
              name: species.name,
              bond,
              needed: BALANCE.recruitBondNeeded[species.rarity],
            };
          }
        }
        break;
      }
      case 'ambush': {
        const enemyId = selectEnemy(area, rng);
        if (enemyId) {
          // Still draw the level roll for a new player, then override it, so a
          // given seed keeps the same rng sequence.
          const rolledLevel = randomInRange(rng, area.levelRange[0], area.levelRange[1]);
          const level = isNewPlayer(state) ? area.levelRange[0] : rolledLevel;
          room.pendingEncounter = { enemyId, resolved: false, level };
          ambushEnemy = enemyId;
        }
        break;
      }
      case 'nothing':
        break;
    }

    // A curio is spent no matter what it gave back.
    placed.used = true;
    runStats.curiosUsed += 1;

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({
      success: true,
      text,
      outcome,
      gains,
      runLoot: getRunLoot(dungeon),
      inventory: state.inventory,
      dungeon: sanitizeDungeonForClient(dungeon),
      ...(ambushEnemy ? { encounter: true, enemy: ambushEnemy } : {}),
    });
  } catch (error: unknown) {
    return internalError(c, error, 'Use curio');
  }
});

explorationRouter.post('/game/dungeon/party/replace', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; outId: string; inId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, outId, inId } = body;
    if (!anonymousId || !outId || !inId) {
      return c.json({ error: 'Missing required fields: anonymousId, outId, inId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    const state = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: ACTIVE_BATTLE_ERROR }, 409);
    }

    const dungeon = state.dungeon;
    if (!dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    if (!state.playerFamiliars.includes(inId)) {
      return c.json({ error: 'That familiar is not owned' }, 400);
    }

    if (dungeon.party.includes(inId)) {
      return c.json({ error: 'That familiar is already in your party' }, 400);
    }

    // Only a familiar recruited during this run can join mid-run, and only
    // once: otherwise any owned familiar could be cycled in at full HP.
    if (!(dungeon.runRecruits ?? []).includes(inId)) {
      return c.json({ error: 'Only a familiar recruited this run can join mid-run' }, 400);
    }

    const outIndex = dungeon.party.indexOf(outId);
    if (outIndex === -1) {
      return c.json({ error: 'That familiar is not in your party' }, 400);
    }

    const incoming = getFamiliar(inId);
    if (!incoming) {
      return c.json({ error: 'Invalid familiar id' }, 400);
    }

    // Replace in place so activeIndex keeps pointing at the same slot. The two
    // rosters normally match index-for-index; fall back to the other roster's
    // index if an old save drifted.
    dungeon.party[outIndex] = inId;
    if (state.activeParty[outIndex] === outId) {
      state.activeParty[outIndex] = inId;
    } else {
      const activeIndex = state.activeParty.indexOf(outId);
      if (activeIndex !== -1) {
        state.activeParty[activeIndex] = inId;
      }
    }

    dungeon.runRecruits = (dungeon.runRecruits ?? []).filter((id) => id !== inId);
    delete dungeon.partyHp[outId];
    delete dungeon.partyMp[outId];
    const stats = scaleFamiliarStats(incoming.stats, state.familiarLevels?.[inId] ?? 1);
    dungeon.partyHp[inId] = stats.maxHp;
    dungeon.partyMp[inId] = stats.maxMp;

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ state: sanitizeStateForClient(state) });
  } catch (error: unknown) {
    return internalError(c, error, 'Replace party member');
  }
});

explorationRouter.post('/game/dungeon/exit', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const anonymousId = body.anonymousId;
    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    const state: GameState = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: ACTIVE_BATTLE_ERROR }, 409);
    }

    // Idempotent exit: no active dungeon is a successful no-op (the dungeon is
    // already cleared by a loss or boss victory).
    if (!state.dungeon) {
      return c.json({ success: true });
    }

    // Leaving banks everything found this run.
    const banked = bankRunLoot(state);
    const runSummary: RunSummary = buildRunSummary({
      outcome: 'retreated',
      areaId: state.dungeon.areaId,
      areaName: AREAS[state.dungeon.areaId]?.name,
      stats: getRunStats(state.dungeon),
      loot: banked,
    });
    state.lastRunSummary = runSummary;
    state.dungeon = null;

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, banked, runSummary });
  } catch (error: unknown) {
    return internalError(c, error, 'Exit dungeon');
  }
});

explorationRouter.post('/game/run-summary/ack', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const anonymousId = body.anonymousId;
    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);
    const state: GameState = loaded.state;

    // Idempotent: acking an already-cleared summary is a successful no-op.
    if (!state.lastRunSummary) {
      return c.json({ success: true });
    }

    state.lastRunSummary = undefined;

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true });
  } catch (error: unknown) {
    return internalError(c, error, 'Acknowledge run summary');
  }
});

export default explorationRouter;
