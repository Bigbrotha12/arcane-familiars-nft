import { Hono } from 'hono';
import type { GameState } from '@arcane-familiars/game-logic';
import { AREAS, generateDungeon, rollEncounter, rollTreasure, selectTreasure, selectEnemy, getFamiliar, RoomType } from '@arcane-familiars/game-logic';

const explorationRouter = new Hono<{ Bindings: { DB: D1Database } }>();

explorationRouter.post('/game/dungeon/enter', async (c) => {
  try {
    const { anonymousId, areaId } = await c.req.json<{ anonymousId: string; areaId: string }>();

    if (!anonymousId || !areaId) {
      return c.json({ error: 'Missing required fields: anonymousId, areaId' }, 400);
    }

    const row = await c.env.DB
      .prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
      .bind(anonymousId)
      .first<{ state_json: string }>();

    if (!row) {
      return c.json({ error: 'Game state not found' }, 404);
    }

    const state: GameState = JSON.parse(row.state_json);

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

    state.dungeon = dungeon;
    state.lastSaved = Date.now();
    const stateJson = JSON.stringify(state);

    await c.env.DB
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(anonymous_id)
         DO UPDATE SET state_json = ?, updated_at = datetime('now')`
      )
      .bind(anonymousId, stateJson, stateJson)
      .run();

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

    const row = await c.env.DB
      .prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
      .bind(anonymousId)
      .first<{ state_json: string }>();

    if (!row) {
      return c.json({ error: 'Game state not found' }, 404);
    }

    const state: GameState = JSON.parse(row.state_json);

    if (!state.dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    const room = state.dungeon.rooms[roomId];
    if (!room) {
      return c.json({ error: 'Room not found' }, 404);
    }

    room.cleared = true;
    state.dungeon.currentRoomId = roomId;

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

    state.lastSaved = Date.now();
    const stateJson = JSON.stringify(state);

    await c.env.DB
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(anonymous_id)
         DO UPDATE SET state_json = ?, updated_at = datetime('now')`
      )
      .bind(anonymousId, stateJson, stateJson)
      .run();

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

    const row = await c.env.DB
      .prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
      .bind(anonymousId)
      .first<{ state_json: string }>();

    if (!row) {
      return c.json({ error: 'Game state not found' }, 404);
    }

    const state: GameState = JSON.parse(row.state_json);

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

    const existingItem = state.inventory.items.find((i) => i.itemId === itemId);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      state.inventory.items.push({ itemId, quantity: 1 });
    }

    state.lastSaved = Date.now();
    const stateJson = JSON.stringify(state);

    await c.env.DB
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(anonymous_id)
         DO UPDATE SET state_json = ?, updated_at = datetime('now')`
      )
      .bind(anonymousId, stateJson, stateJson)
      .run();

    return c.json({ success: true, inventory: state.inventory });
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

    const row = await c.env.DB
      .prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
      .bind(anonymousId)
      .first<{ state_json: string }>();

    if (!row) {
      return c.json({ error: 'Game state not found' }, 404);
    }

    const state: GameState = JSON.parse(row.state_json);
    state.dungeon = null;
    state.lastSaved = Date.now();
    const stateJson = JSON.stringify(state);

    await c.env.DB
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(anonymous_id)
         DO UPDATE SET state_json = ?, updated_at = datetime('now')`
      )
      .bind(anonymousId, stateJson, stateJson)
      .run();

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Exit dungeon error:', error.message);
    return c.json({ error: 'Failed to exit dungeon' }, 500);
  }
});

export default explorationRouter;
