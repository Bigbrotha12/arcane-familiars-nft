import { Hono } from 'hono';
import type { GameState } from '@arcane-familiars/game-logic';

const gameStateRouter = new Hono<{ Bindings: { DB: D1Database } }>();

function createDefaultGameState(anonymousId: string): GameState {
  const id = crypto.randomUUID();
  const now = Date.now();

  return {
    version: 1,
    id,
    anonymousId,
    playerFamiliars: ['yellowFighter', 'aquaSprite'],
    activeParty: [],
    inventory: {
      currency: 100,
      items: [
        { itemId: 'health-potion', quantity: 3 },
      ],
    },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: now,
  };
}

gameStateRouter.post('/game/state/load', async (c) => {
  try {
    const { anonymousId } = await c.req.json();

    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }

    const row = await c.env.DB
      .prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
      .bind(anonymousId)
      .first<{ state_json: string }>();

    if (row) {
      const state: GameState = JSON.parse(row.state_json);
      return c.json({ state });
    }

    const state = createDefaultGameState(anonymousId);

    await c.env.DB
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, updated_at)
         VALUES (?, ?, datetime('now'))`
      )
      .bind(anonymousId, JSON.stringify(state))
      .run();

    return c.json({ state });
  } catch (error: any) {
    console.error('Load state error:', error.message);
    return c.json({ error: 'Failed to load game state' }, 500);
  }
});

gameStateRouter.post('/game/state/save', async (c) => {
  try {
    const { anonymousId, state } = await c.req.json<{ anonymousId: string; state: GameState }>();

    if (!anonymousId || !state) {
      return c.json({ error: 'Missing required fields: anonymousId, state' }, 400);
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

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Save state error:', error.message);
    return c.json({ error: 'Failed to save game state' }, 500);
  }
});

export default gameStateRouter;
