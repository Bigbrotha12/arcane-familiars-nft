import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { getOwnedFamiliars, isValidEthAddress } from '../utils/imx';
import { getErrorMessage } from '../utils/http';

const ownedFamiliarsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/game/owned-familiars
 *
 * Returns the familiar species ids the signed-in player owns on-chain for the
 * Arcane Familiars collection. Auth-gated (mounted under /api/game/*), so the
 * account is derived from the verified Passport `sub` on the context.
 *
 * Response contract:
 *   { familiars: string[], synced: boolean, error?: string }
 *
 *   - No bound wallet       → { familiars: [], synced: false }
 *   - Bound wallet, success → { familiars: ['whiteDog', ...], synced: true }
 *   - Upstream/network err  → { familiars: [], synced: false, error: '...' } (200,
 *                             so the frontend can show "couldn't sync, defaults")
 */
ownedFamiliarsRouter.get('/game/owned-familiars', async (c) => {
  const accountKey = c.get('accountKey');

  if (!accountKey) {
    return c.json({ familiars: [], synced: false }, 200);
  }

  try {
    const row = await c.env.DB
      .prepare('SELECT wallet_address FROM wallet_bindings WHERE sub = ?')
      .bind(accountKey)
      .first<{ wallet_address: string }>();

    if (!row || !row.wallet_address) {
      return c.json({ familiars: [], synced: false }, 200);
    }

    const wallet = row.wallet_address.toLowerCase();
    if (!isValidEthAddress(wallet)) {
      return c.json({ familiars: [], synced: false, error: 'invalid wallet address' }, 200);
    }

    const env = c.env.ENVIRONMENT === 'production' ? 'production' : 'sandbox';
    const collection = env === 'production'
      ? c.env.COLLECTION_CONTRACT_MAINNET
      : c.env.COLLECTION_CONTRACT_SANDBOX;

    const species = await getOwnedFamiliars(wallet, collection, env, c.env);
    return c.json({ familiars: species, synced: true }, 200);
  } catch (error: unknown) {
    console.error('owned-familiars sync error:', getErrorMessage(error));
    return c.json(
      { familiars: [], synced: false, error: getErrorMessage(error) },
      200,
    );
  }
});

export default ownedFamiliarsRouter;
