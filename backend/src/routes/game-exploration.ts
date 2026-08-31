import { Hono } from 'hono';
import type { GameState } from '@arcane-familiars/game-logic';
import {
  AREAS,
  generateDungeon,
  rollEncounter,
  rollTreasure,
  selectTreasure,
  selectEnemy,
  getFamiliar,
  seededRandom,
  randomInRange,
  RoomType,
  validateDungeonExplore,
  validateParty,
} from '@arcane-familiars/game-logic';
import type { Bindings, Variables } from '../types';
import { getOrCreateGameState, saveGameStateIfVersion } from '../utils/saveManager';
import { internalError, readBody } from '../utils/http';

const explorationRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function cryptoSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
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
        dungeon.partyHp[familiarId] = familiar.stats.hp;
        dungeon.partyMp[familiarId] = familiar.stats.mp;
      }
    }

    state.dungeon = dungeon;

    const saved = await saveGameStateIfVersion(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ dungeon, area });
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

    if (room.cleared) {
      // Re-entering a cleared room: replay the persisted outcome, never re-roll.
      if (room.pendingEncounter && !room.pendingEncounter.resolved) {
        encounter = true;
        enemy = room.pendingEncounter.enemyId;
      }
      if (room.pendingTreasure && !room.pendingTreasure.looted) {
        treasure = true;
        treasureItem = room.pendingTreasure.itemId;
      }
    } else {
      room.cleared = true;

      const rng = seededRandom((state.dungeon.seed ?? 0) ^ hashString(roomId));

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

      // Treasure only when the room has no encounter (spec: "if no encounter").
      if (!encounter && room.treasurePool.length > 0 && rollTreasure(room, rng)) {
        const selectedTreasure = selectTreasure(room, rng);
        if (selectedTreasure) {
          treasure = true;
          treasureItem = selectedTreasure;
          room.pendingTreasure = { itemId: selectedTreasure, looted: false };
        }
      }
    }

    const saved = await saveGameStateIfVersion(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ room, encounter, enemy, treasure, treasureItem });
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

    if (!state.dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
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

    const existingItem = state.inventory.items.find((i) => i.itemId === itemId);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      state.inventory.items.push({ itemId, quantity: 1 });
    }

    const saved = await saveGameStateIfVersion(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, inventory: state.inventory });
  } catch (error: unknown) {
    return internalError(c, error, 'Collect treasure');
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

    // Idempotent exit: no active dungeon is a successful no-op (the dungeon is
    // already cleared by a loss or boss victory).
    if (!state.dungeon) {
      return c.json({ success: true });
    }

    state.dungeon = null;

    const saved = await saveGameStateIfVersion(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true });
  } catch (error: unknown) {
    return internalError(c, error, 'Exit dungeon');
  }
});

export default explorationRouter;
