import { Hono } from 'hono';
import { getShopEntry, getItem } from '@arcane-familiars/game-logic';
import type { Bindings, Variables } from '../types';
import { getOrCreateGameState, hasActiveBattle, saveGameStateIfVersionNoBattle } from '../utils/saveManager';
import { internalError, readBody } from '../utils/http';

const shopRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

shopRouter.post('/game/shop/buy', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; itemId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, itemId } = body;
    if (!anonymousId || !itemId) {
      return c.json({ error: 'Missing required fields: anonymousId, itemId' }, 400);
    }

    const entry = getShopEntry(itemId);
    if (!entry || !getItem(itemId)) {
      return c.json({ error: 'That item is not for sale' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);
    const state = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: 'Cannot shop during an active battle' }, 409);
    }

    if (state.inventory.currency < entry.price) {
      return c.json({ error: 'Not enough currency' }, 400);
    }

    state.inventory.currency -= entry.price;
    const existing = state.inventory.items.find((item) => item.itemId === itemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      state.inventory.items.push({ itemId, quantity: 1 });
    }

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, state });
  } catch (error: unknown) {
    return internalError(c, error, 'Shop purchase');
  }
});

export default shopRouter;
