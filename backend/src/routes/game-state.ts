import { Hono } from 'hono';
import type { Bindings } from '../types';
import type { GameState } from '@arcane-familiars/game-logic';
import { loadGameState, mutateGameState } from '../store/gameStateStore';

const gameStateRouter = new Hono<{ Bindings: Bindings }>();

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
        { itemId: 'potion_small', quantity: 3 },
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

    const loaded = await loadGameState(c.env.DB, anonymousId);

    if (loaded) {
      return c.json({ state: loaded.state });
    }

    const state = createDefaultGameState(anonymousId);

    await c.env.DB
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, revision, updated_at)
         VALUES (?, ?, 1, datetime('now'))`
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

    // Client saves are rejected while a server-authoritative battle is in
    // progress — a stale client snapshot would clobber battle results.
    const activeBattle = await c.env.DB
      .prepare('SELECT battle_id FROM active_battles WHERE anonymous_id = ?')
      .bind(anonymousId)
      .first<{ battle_id: string }>();
    if (activeBattle) {
      return c.json({ error: 'Cannot save during an active battle' }, 409);
    }

    const saved = await mutateGameState(c.env.DB, anonymousId, (s) => {
      Object.assign(s, state);
    });

    if (!saved) {
      return c.json({ error: 'Game state not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Save state error:', error.message);
    return c.json({ error: 'Failed to save game state' }, 500);
  }
});

export default gameStateRouter;
