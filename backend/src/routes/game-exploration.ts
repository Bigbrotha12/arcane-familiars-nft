import { Hono } from 'hono';
import type { Bindings } from '../types';
import {
  AREAS,
  generateDungeon,
  rollEncounter,
  rollTreasure,
  selectTreasure,
  selectEnemy,
  getFamiliar,
  validateDungeonExplore,
  RoomType,
} from '@arcane-familiars/game-logic';
import { loadGameState, mutateGameState } from '../store/gameStateStore';

const explorationRouter = new Hono<{ Bindings: Bindings }>();

explorationRouter.post('/game/dungeon/enter', async (c) => {
  try {
    const { anonymousId, areaId } = await c.req.json<{ anonymousId: string; areaId: string }>();

    if (!anonymousId || !areaId) {
      return c.json({ error: 'Missing required fields: anonymousId, areaId' }, 400);
    }

    const loaded = await loadGameState(c.env.DB, anonymousId);
    if (!loaded) {
      return c.json({ error: 'Game state not found' }, 404);
    }
    const state = loaded.state;

    if (!state.unlockedAreas.includes(areaId)) {
      return c.json({ error: 'Area is not unlocked' }, 403);
    }

    if (state.dungeon) {
      return c.json({ error: 'Already in a dungeon' }, 409);
    }

    if (state.activeParty.length !== 2) {
      return c.json({ error: 'Party must have exactly 2 members' }, 400);
    }

    const area = AREAS[areaId];
    if (!area) {
      return c.json({ error: 'Invalid area id' }, 400);
    }

    const dungeon = generateDungeon(area, Date.now());
    dungeon.party = [...state.activeParty];
    for (const familiarId of dungeon.party) {
      const familiar = getFamiliar(familiarId);
      if (familiar) {
        dungeon.partyHp[familiarId] = familiar.stats.hp;
        dungeon.partyMp[familiarId] = familiar.stats.mp;
      }
    }

    let entered = false;
    await mutateGameState(c.env.DB, anonymousId, (s) => {
      // Re-check under the current revision to avoid clobbering a concurrent enter.
      if (s.dungeon) return false;
      s.dungeon = dungeon;
      entered = true;
    });

    if (!entered) {
      return c.json({ error: 'Already in a dungeon' }, 409);
    }

    await c.env.DB
      .prepare(
        `INSERT INTO dungeon_runs (id, anonymous_id, area_id, started_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .bind(crypto.randomUUID(), anonymousId, areaId)
      .run();

    return c.json({ dungeon, area });
  } catch (error: any) {
    console.error('Enter dungeon error:', error.message);
    return c.json({ error: 'Failed to enter dungeon' }, 500);
  }
});

explorationRouter.post('/game/dungeon/explore', async (c) => {
  try {
    const { anonymousId, roomId } = await c.req.json<{ anonymousId: string; roomId: string }>();

    if (!anonymousId || !roomId) {
      return c.json({ error: 'Missing required fields: anonymousId, roomId' }, 400);
    }

    const loaded = await loadGameState(c.env.DB, anonymousId);
    if (!loaded) {
      return c.json({ error: 'Game state not found' }, 404);
    }
    const state = loaded.state;

    if (!state.dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    const room = state.dungeon.rooms[roomId];
    if (!room) {
      return c.json({ error: 'Room not found' }, 404);
    }

    if (room.cleared) {
      return c.json({ error: 'Room has already been cleared' }, 400);
    }

    // B4: the target room must be adjacent to the player's current room.
    const moveValidation = validateDungeonExplore(roomId, state.dungeon);
    if (!moveValidation.valid) {
      return c.json({ error: moveValidation.error }, 400);
    }

    const rng = () => Math.random();

    const area = AREAS[state.dungeon.areaId];
    if (!area) {
      return c.json({ error: 'Invalid area' }, 500);
    }

    let encounter: boolean;
    let enemy: string | null = null;

    if (room.type === RoomType.Boss) {
      encounter = true;
      enemy = area.bossId;
    } else {
      encounter = rollEncounter(room, rng);
      if (encounter) {
        enemy = selectEnemy(area, rng);
      }
    }

    let treasure = false;
    let treasureItem: string | null = null;

    if (room.treasurePool.length > 0) {
      treasure = rollTreasure(room, rng);
      if (treasure) {
        treasureItem = selectTreasure(room, rng);
      }
    }

    let explored = false;
    await mutateGameState(c.env.DB, anonymousId, (s) => {
      // Re-check under the current revision: another writer may have cleared it.
      const target = s.dungeon?.rooms[roomId];
      if (!s.dungeon || !target || target.cleared) return false;
      target.cleared = true;
      s.dungeon.currentRoomId = roomId;
      s.dungeon.pendingEncounter = encounter && enemy
        ? { roomId, enemyId: enemy, isBoss: room.type === RoomType.Boss }
        : null;
      if (treasureItem) {
        s.dungeon.pendingTreasures = { ...s.dungeon.pendingTreasures, [roomId]: treasureItem };
      }
      explored = true;
    });

    if (!explored) {
      return c.json({ error: 'Room has already been cleared' }, 400);
    }

    return c.json({ room, encounter, enemy, treasure, treasureItem });
  } catch (error: any) {
    console.error('Explore room error:', error.message);
    return c.json({ error: 'Failed to explore room' }, 500);
  }
});

explorationRouter.post('/game/dungeon/collect-treasure', async (c) => {
  try {
    const { anonymousId, roomId, itemId } = await c.req.json<{ anonymousId: string; roomId: string; itemId: string }>();

    if (!anonymousId || !roomId || !itemId) {
      return c.json({ error: 'Missing required fields: anonymousId, roomId, itemId' }, 400);
    }

    const loaded = await loadGameState(c.env.DB, anonymousId);
    if (!loaded) {
      return c.json({ error: 'Game state not found' }, 404);
    }
    const state = loaded.state;

    if (!state.dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    const room = state.dungeon.rooms[roomId];
    if (!room) {
      return c.json({ error: 'Room not found' }, 404);
    }

    if (!room.cleared) {
      return c.json({ error: 'Room has not been explored' }, 400);
    }

    const pendingItemId = state.dungeon.pendingTreasures?.[roomId];
    if (!pendingItemId) {
      return c.json({ error: 'No treasure available in this room' }, 400);
    }

    if (pendingItemId !== itemId) {
      return c.json({ error: 'Item is not the treasure rolled for this room' }, 400);
    }

    let collected = false;
    await mutateGameState(c.env.DB, anonymousId, (s) => {
      // Re-check under the current revision: treasure may already be collected.
      const pending = s.dungeon?.pendingTreasures?.[roomId];
      if (!pending || pending !== itemId) return false;

      delete s.dungeon!.pendingTreasures![roomId];

      s.inventory = s.inventory ?? { currency: 0, items: [] };
      const existingItem = s.inventory.items.find((i) => i.itemId === itemId);
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        s.inventory.items.push({ itemId, quantity: 1 });
      }
      collected = true;
    });

    if (!collected) {
      return c.json({ error: 'No treasure available in this room' }, 400);
    }

    const updated = await loadGameState(c.env.DB, anonymousId);

    return c.json({ success: true, inventory: updated?.state.inventory });
  } catch (error: any) {
    console.error('Collect treasure error:', error.message);
    return c.json({ error: 'Failed to collect treasure' }, 500);
  }
});

explorationRouter.post('/game/dungeon/exit', async (c) => {
  try {
    const { anonymousId } = await c.req.json<{ anonymousId: string }>();

    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }

    const loaded = await loadGameState(c.env.DB, anonymousId);
    if (!loaded) {
      return c.json({ error: 'Game state not found' }, 404);
    }

    await mutateGameState(c.env.DB, anonymousId, (s) => {
      s.dungeon = null;
    });

    // Close any open dungeon run for this user.
    await c.env.DB
      .prepare(
        `UPDATE dungeon_runs
         SET ended_at = datetime('now')
         WHERE anonymous_id = ? AND ended_at IS NULL`
      )
      .bind(anonymousId)
      .run();

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Exit dungeon error:', error.message);
    return c.json({ error: 'Failed to exit dungeon' }, 500);
  }
});

export default explorationRouter;
