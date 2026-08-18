import { Hono } from 'hono';
import { validateParty } from '@arcane-familiars/game-logic';
import type { Bindings } from '../types';
import { getOrCreateGameState, saveGameStateIfVersion } from '../utils/saveManager';
import { getErrorMessage, readBody } from '../utils/http';

const gameStateRouter = new Hono<{ Bindings: Bindings }>();

gameStateRouter.post('/game/state/load', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string }>(c);
    const anonymousId = body?.anonymousId;
    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }

    const { state } = await getOrCreateGameState(c.env.DB, anonymousId);
    return c.json({ state });
  } catch (error: unknown) {
    console.error('Load state error:', getErrorMessage(error));
    return c.json({ error: 'Failed to load game state' }, 500);
  }
});

/**
 * Party selection is the only client-writable part of the save. The server
 * owns inventory, unlocks, dungeon, and battle results.
 */
gameStateRouter.post('/game/state/party', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; activeParty: string[] }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, activeParty } = body;
    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }
    if (!Array.isArray(activeParty)) {
      return c.json({ error: 'Missing required field: activeParty' }, 400);
    }

    const loaded = await getOrCreateGameState(c.env.DB, anonymousId);
    const state = loaded.state;

    const validation = validateParty(activeParty, state.playerFamiliars);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? 'Invalid party' }, 400);
    }

    if (state.dungeon) {
      return c.json({ error: 'Cannot change party while in a dungeon' }, 409);
    }

    state.activeParty = [...activeParty];

    const saved = await saveGameStateIfVersion(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, state });
  } catch (error: unknown) {
    console.error('Set party error:', getErrorMessage(error));
    return c.json({ error: 'Failed to set party' }, 500);
  }
});

export default gameStateRouter;
