import { Hono } from 'hono';
import { CHARM_SALVAGE } from '@arcane-familiars/game-logic';
import type { Bindings, Variables } from '../types';
import { getOrCreateGameState, hasActiveBattle, saveGameStateIfVersionNoBattle } from '../utils/saveManager';
import { internalError, readBody } from '../utils/http';

const gameCharmsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ACTIVE_BATTLE_ERROR = 'Cannot change charms during an active battle';

/**
 * Equip a charm on a familiar, or unequip it with `familiarId: null`.
 * Equipping moves the charm: whatever that familiar wore is unequipped and the
 * charm's previous owner is cleared, so one charm is never worn twice.
 */
gameCharmsRouter.post('/game/charms/equip', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; charmUid: string; familiarId?: string | null }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, charmUid } = body;
    const familiarId = body.familiarId ?? null;
    if (!anonymousId || !charmUid) {
      return c.json({ error: 'Missing required fields: anonymousId, charmUid' }, 400);
    }
    if (familiarId !== null && typeof familiarId !== 'string') {
      return c.json({ error: 'Invalid familiarId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);
    const state = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: ACTIVE_BATTLE_ERROR }, 409);
    }

    const charm = (state.charms ?? []).find((entry) => entry.uid === charmUid);
    if (!charm) {
      return c.json({ error: 'Charm is not owned' }, 400);
    }

    if (familiarId !== null) {
      if (!state.playerFamiliars.includes(familiarId)) {
        return c.json({ error: 'Familiar is not owned' }, 400);
      }
      // One charm per familiar: clear whatever it was wearing first.
      for (const entry of state.charms ?? []) {
        if (entry.equippedTo === familiarId) delete entry.equippedTo;
      }
      charm.equippedTo = familiarId;
    } else {
      delete charm.equippedTo;
    }

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, charms: state.charms ?? [] });
  } catch (error: unknown) {
    return internalError(c, error, 'Equip charm');
  }
});

/**
 * Salvage an unequipped charm for coins. Equipped charms must be unequipped
 * first so a worn charm can never vanish from under the familiar.
 */
gameCharmsRouter.post('/game/charms/salvage', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; charmUid: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, charmUid } = body;
    if (!anonymousId || !charmUid) {
      return c.json({ error: 'Missing required fields: anonymousId, charmUid' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);
    const state = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: ACTIVE_BATTLE_ERROR }, 409);
    }

    const index = (state.charms ?? []).findIndex((entry) => entry.uid === charmUid);
    if (index < 0) {
      return c.json({ error: 'Charm is not owned' }, 400);
    }

    const charm = state.charms![index];
    if (charm.equippedTo) {
      return c.json({ error: 'Unequip the charm before salvaging it' }, 400);
    }

    const coins = CHARM_SALVAGE[charm.rarity] ?? 0;
    state.charms!.splice(index, 1);
    state.inventory.currency += coins;

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, charms: state.charms ?? [], currency: state.inventory.currency, coins });
  } catch (error: unknown) {
    return internalError(c, error, 'Salvage charm');
  }
});

export default gameCharmsRouter;
