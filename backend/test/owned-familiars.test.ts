import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import type { Bindings, Variables } from '../src/types';
// The `?owned-familiars-test` query forces a fresh module graph in the test
// bundle, exactly like `?auth-adopt-test` in auth-adopt.test.ts. Without it
// the import resolves to the main Worker's pre-bundled module, where the
// `vi.mock` on ../src/utils/imx below is not applied. The fresh graph is still
// the real router; only `getOwnedFamiliars` is stubbed.
import ownedFamiliarsRouter from '../src/routes/game-owned-familiars?owned-familiars-test';
import { getOwnedFamiliars, mapTokenToFamiliar } from '../src/utils/imx';
import type { IMXNFTWithBalance } from '../src/utils/imx';
import { getFamiliar } from '@arcane-familiars/game-logic';

/**
 * Focused tests for the owned-familiars feature.
 *
 * These are intentionally decoupled from the shared auth middleware (owned by
 * the wallet-binding/session agent) and from live Immutable calls. They cover:
 *   1. The pure token → familiar mapping helper (real implementation).
 *   2. The `/api/game/owned-familiars` route response contract for a bound and
 *      unbound wallet, using a minimal Hono app that sets `accountKey` directly
 *      (the same thing the production auth middleware does) and a stubbed
 *      `getOwnedFamiliars` so the on-chain call is deterministic.
 */

vi.mock('../src/utils/imx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/imx')>();
  return {
    ...actual,
    // Deterministic stub — never makes a live Immutable indexer call.
    getOwnedFamiliars: vi.fn(async () => ['whiteDog', 'shadowCat']),
  };
});

function makeEnv(db: D1Database): Bindings {
  return {
    DB: db,
    ENVIRONMENT: 'sandbox',
    // Placeholder URLs — `getOwnedFamiliars` is stubbed, so these are never
    // fetched; they must not point at the live Immutable indexer.
    IMX_API_SANDBOX: 'https://imx-sandbox.invalid',
    IMX_API_MAINNET: 'https://imx-mainnet.invalid',
    COLLECTION_CONTRACT_SANDBOX: '0x0000000000000000000000000000000000000001',
    COLLECTION_CONTRACT_MAINNET: '0x0000000000000000000000000000000000000002',
    IMMUTABLE_CLIENT_ID: 'test-client-id',
    IMMUTABLE_AUTH_ISSUER: 'https://auth.immutable.com/',
    IMMUTABLE_JWKS_URI: 'https://auth.immutable.com/.well-known/jwks.json',
  };
}

function makeApp(accountKey: string | undefined, _db: D1Database): Hono<{ Bindings: Bindings; Variables: Variables }> {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  app.use('*', async (c, next) => {
    if (accountKey) c.set('accountKey', accountKey);
    await next();
  });
  app.route('/', ownedFamiliarsRouter);
  return app;
}

function makeNft(overrides: Partial<IMXNFTWithBalance> = {}): IMXNFTWithBalance {
  return {
    chain: { id: 'eip155:13473', name: 'imtbl-zkevm-mainnet' },
    token_id: '1',
    contract_address: '0x0000000000000000000000000000000000000001',
    contract_type: 'ERC721',
    indexed_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    metadata_synced_at: null,
    metadata_id: null,
    name: null,
    description: null,
    image: null,
    external_link: null,
    animation_url: null,
    youtube_url: null,
    attributes: [],
    balance: '1',
    ...overrides,
  };
}

describe('mapTokenToFamiliar', () => {
  it('maps by explicit species attribute', () => {
    const nft = makeNft({
      token_id: '101',
      attributes: [{ trait_type: 'species', value: 'shadowCat' }],
    });
    expect(mapTokenToFamiliar(nft)).toBe('shadowCat');
  });

  it('maps by friendly NFT name', () => {
    const nft = makeNft({ token_id: '5', name: 'White Dog' });
    expect(mapTokenToFamiliar(nft)).toBe('whiteDog');
  });

  it('returns null for unknown species / boss NFTs', () => {
    const nft = makeNft({ token_id: '999', name: 'Shadow Lord' });
    expect(mapTokenToFamiliar(nft)).toBeNull();
  });
});

describe('familiar id sanity', () => {
  it('every mapped species id exists in game-logic FAMILIARS', () => {
    // whiteDog/yellowFighter/aquaSprite must be resolvable by the game.
    for (const id of ['whiteDog', 'yellowFighter', 'aquaSprite', 'shadowCat']) {
      expect(getFamiliar(id)).toBeDefined();
      expect(getFamiliar(id)?.isBoss).not.toBe(true);
    }
  });
});

// ---- Route contract: uses the shared in-memory D1 (migrations applied by
//      apply-migrations.ts), setting `accountKey` directly in a test
//      middleware to stand in for the auth layer owned by another agent. ----

async function fetchOwnedFamiliars(accountKey: string | undefined, db: D1Database): Promise<Response> {
  const app = makeApp(accountKey, db);
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request('https://example.com/game/owned-familiars'), makeEnv(db), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('GET /game/owned-familiars response contract', () => {
  it('returns synced:false with empty list when no wallet is bound', async () => {
    const db = env.DB;
    // Ensure no binding row for this sub.
    await db.prepare('DELETE FROM wallet_bindings WHERE sub = ?').bind('sub-no-wallet').run();

    const res = await fetchOwnedFamiliars('sub-no-wallet', db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { familiars: string[]; synced: boolean };
    expect(body).toEqual({ familiars: [], synced: false });
    expect(getOwnedFamiliars).not.toHaveBeenCalled();
  });

  it('returns synced:true and the stubbed familiar list when a wallet is bound', async () => {
    const db = env.DB;
    vi.mocked(getOwnedFamiliars).mockClear();
    await db.prepare('DELETE FROM wallet_bindings WHERE sub = ?').bind('sub-bound').run();
    await db
      .prepare('INSERT OR REPLACE INTO wallet_bindings (sub, wallet_address) VALUES (?, ?)')
      .bind('sub-bound', '0xb7eaa855fa6432d0597f297bace4613c33a075d1')
      .run();

    const res = await fetchOwnedFamiliars('sub-bound', db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { familiars: string[]; synced: boolean };
    expect(body).toEqual({ familiars: ['whiteDog', 'shadowCat'], synced: true });

    // The route passed the bound wallet (lowercased) and resolved collection/env.
    expect(getOwnedFamiliars).toHaveBeenCalledTimes(1);
    const args = vi.mocked(getOwnedFamiliars).mock.calls[0];
    expect(args[0]).toBe('0xb7eaa855fa6432d0597f297bace4613c33a075d1');
    expect(args[1]).toBe('0x0000000000000000000000000000000000000001');
    expect(args[2]).toBe('sandbox');

    await db.prepare('DELETE FROM wallet_bindings WHERE sub = ?').bind('sub-bound').run();
  });

  it('returns a well-formed response even with no accountKey set', async () => {
    const db = env.DB;
    const res = await fetchOwnedFamiliars(undefined, db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { familiars: string[]; synced: boolean };
    expect(body).toEqual({ familiars: [], synced: false });
  });
});
