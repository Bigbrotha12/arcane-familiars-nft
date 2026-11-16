import { Hono } from 'hono';
import type { ChestTier, GameState } from '@arcane-familiars/game-logic';
import {
  AREAS,
  generateDungeon,
  rollEncounter,
  rollRoomTreasure,
  roomRollSeed,
  selectEnemy,
  getFamiliar,
  healPartyAtRest,
  seededRandom,
  randomInRange,
  RoomType,
  validateDungeonExplore,
  validateParty,
  scaleFamiliarStats,
  getRunLoot,
  addInventoryItem,
  bankRunLoot,
} from '@arcane-familiars/game-logic';
import type { Bindings, Variables } from '../types';
import { getOrCreateGameState, hasActiveBattle, saveGameStateIfVersionNoBattle } from '../utils/saveManager';
import { internalError, readBody } from '../utils/http';
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

explorationRouter.post('/game/dungeon/enter', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; areaId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, areaId } = body;
    if (!anonymousId || !areaId) {
      return c.json({ error: 'Missing required fields: anonymousId, areaId' }, 400);
    }

    const area = AREAS[areaId];
    if (!area) {
      return c.json({ error: 'Invalid area id' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    const state = loaded.state;

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

    const dungeon = generateDungeon(area, cryptoSeed());
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

    if (room.cleared) {
      // Re-entering a cleared room: replay the persisted outcome, never re-roll.
      if (room.pendingEncounter && !room.pendingEncounter.resolved) {
        encounter = true;
        enemy = room.pendingEncounter.enemyId;
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

      const rng = seededRandom(roomRollSeed(state.dungeon.seed ?? 0, roomId));

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
            // enemy strength for the same encounter.
            const level = randomInRange(rng, area.levelRange[0], area.levelRange[1]);
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
        };
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

    // Treasure is run loot, not banked inventory. It is usable during the run
    // and is lost on defeat; exiting or winning banks it.
    const runLoot = getRunLoot(state.dungeon);
    for (const id of pending.items ?? [itemId]) {
      addInventoryItem(runLoot, id);
    }
    runLoot.currency += pending.currency ?? 0;

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, inventory: state.inventory, runLoot });
  } catch (error: unknown) {
    return internalError(c, error, 'Collect treasure');
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
    bankRunLoot(state);
    state.dungeon = null;

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true });
  } catch (error: unknown) {
    return internalError(c, error, 'Exit dungeon');
  }
});

export default explorationRouter;
