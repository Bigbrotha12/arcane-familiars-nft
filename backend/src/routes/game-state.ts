import { Hono } from 'hono';
import { validateParty, reconcileActiveBattle } from '@arcane-familiars/game-logic';
import type { Bindings, Variables } from '../types';
import { getOrCreateGameState, hasActiveBattle, saveGameStateIfVersionNoBattle } from '../utils/saveManager';
import { internalError, readBody } from '../utils/http';

const gameStateRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function getActiveBattleRow(
  db: D1Database,
  anonymousId: string
): Promise<{ battle_id: string; battle_json: string } | null> {
  return db
    .prepare('SELECT battle_id, battle_json FROM active_battles WHERE anonymous_id = ? LIMIT 1')
    .bind(anonymousId)
    .first<{ battle_id: string; battle_json: string }>();
}

gameStateRouter.post('/game/state/load', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string }>(c);
    const anonymousId = body?.anonymousId;
    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const { state } = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);
    return c.json({ state });
  } catch (error: unknown) {
    return internalError(c, error, 'Load state');
  }
});

/**
 * Bootstrap returns the save plus any active battle to resume, and repairs
 * orphaned rows (battle without a dungeon, missing room, or already-resolved
 * encounter) so the unique one-battle index cannot strand the player.
 */
gameStateRouter.post('/game/bootstrap', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string }>(c);
    if (!body?.anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }

    const anonymousId = body.anonymousId;
    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);

    // A guest must never be able to read or write an account-keyed save by
    // presenting a user id. readBody binds authenticated body ids to
    // accountKey, but this explicit provenance check covers the guest path.
    if (isGuest && !loaded.isAnonymous) {
      return c.json({ error: 'Guest session cannot access an account save' }, 403);
    }

    const state = loaded.state;
    const active = await getActiveBattleRow(c.env.DB, anonymousId);

    if (!active) {
      return c.json({ state, battle: null });
    }

    const battle = JSON.parse(active.battle_json);
    const decision = reconcileActiveBattle(state.dungeon, battle);
    if (decision.action === 'delete') {
      await c.env.DB.prepare('DELETE FROM active_battles WHERE battle_id = ? AND anonymous_id = ?')
        .bind(active.battle_id, anonymousId)
        .run();
      return c.json({ state, battle: null });
    }

    return c.json({ state, battle });
  } catch (error: unknown) {
    return internalError(c, error, 'Bootstrap');
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

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);
    const state = loaded.state;

    if (await getActiveBattleRow(c.env.DB, anonymousId)) {
      return c.json({ error: 'Cannot change party during an active battle' }, 409);
    }

    const validation = validateParty(activeParty, state.playerFamiliars);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? 'Invalid party' }, 400);
    }

    if (state.dungeon) {
      return c.json({ error: 'Cannot change party while in a dungeon' }, 409);
    }

    state.activeParty = [...activeParty];

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, state });
  } catch (error: unknown) {
    return internalError(c, error, 'Set party');
  }
});

/**
 * Reorder-only party mutation: promotes `familiarId` to index 0 (the lead /
 * battle-start default). Party membership never changes, so unlike
 * /game/state/party this is allowed anywhere outside an active battle —
 * including mid-dungeon between rooms, which is the primary use case (the
 * exploration HUD's Swap button stays visible during runs). When a dungeon is
 * in progress, `dungeon.party` is reordered identically so the per-run roster
 * order always mirrors `activeParty`; partyHp/partyMp stay keyed by familiar
 * id and are unaffected.
 */
gameStateRouter.post('/game/state/party/active', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; familiarId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, familiarId } = body;
    if (!anonymousId) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }
    if (!familiarId) {
      return c.json({ error: 'Missing required field: familiarId' }, 400);
    }

    const isGuest = c.get('isGuest') ?? false;
    const loaded = await getOrCreateGameState(c.env.DB, anonymousId, isGuest);
    const state = loaded.state;

    if (await hasActiveBattle(c.env.DB, anonymousId)) {
      return c.json({ error: 'Cannot swap party during an active battle' }, 409);
    }

    if (!state.activeParty.includes(familiarId)) {
      return c.json({ error: 'Familiar is not in your active party' }, 400);
    }

    // Defensive: guards array-parity divergence between activeParty and
    // dungeon.party, which is reordered below.
    if (state.dungeon && !state.dungeon.party.includes(familiarId)) {
      return c.json({ error: 'Familiar is not in your active party' }, 400);
    }

    // Mid-run aliveness: with a dungeon in progress the run tracks per-familiar
    // HP, and promoting a fainted familiar would make it the battle-start lead
    // at 0 HP. Outside a run there is no HP concept, so this does not apply.
    if (state.dungeon && (state.dungeon.partyHp[familiarId] ?? 0) <= 0) {
      return c.json({ error: 'Cannot make a fainted familiar the lead' }, 400);
    }

    // No-op short-circuit: when the familiar already leads everywhere it
    // needs to (activeParty, and dungeon.party when a run is in progress),
    // respond success without persisting. The response shape is identical
    // either way (client stays simple), and skipping the write avoids a
    // gratuitous version bump that could 409 a concurrent writer. Checking
    // both lets a mid-run desync still be repaired by this endpoint.
    const activePartyInOrder = state.activeParty[0] === familiarId;
    const dungeonPartyInOrder = !state.dungeon || state.dungeon.party[0] === familiarId;
    if (activePartyInOrder && dungeonPartyInOrder) {
      return c.json({ success: true, state });
    }

    const reorderToLead = (party: string[]): string[] => {
      const next = party.filter((id) => id !== familiarId);
      next.unshift(familiarId);
      return next;
    };

    const reordered = reorderToLead(state.activeParty);

    const validation = validateParty(reordered, state.playerFamiliars);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? 'Invalid party' }, 400);
    }

    state.activeParty = reordered;
    if (state.dungeon) {
      state.dungeon.party = reorderToLead(state.dungeon.party);
    }

    const saved = await saveGameStateIfVersionNoBattle(c.env.DB, anonymousId, state, loaded.version);
    if (!saved) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, state });
  } catch (error: unknown) {
    return internalError(c, error, 'Set active familiar');
  }
});

export default gameStateRouter;
