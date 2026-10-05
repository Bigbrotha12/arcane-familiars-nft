import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../src/types';
import { createGameMintRouter } from '../src/routes/game-mint';
import { MintingProviderError, MockMintingProvider, type MintingProvider } from '../src/services/minting/provider';

/**
 * BC2 mint seam tests. These build a minimal authed/guest Hono app (mirroring
 * what `authMiddleware` does for a verified Passport token) and inject a
 * `MockMintingProvider`, so the full write-ahead / idempotency / status flow is
 * exercised without any network. Migrations (0011, 0012) are applied to the
 * shared in-memory D1 by test/apply-migrations.ts.
 */

const AUTH_SUB = 'sub-mint-user';
const WALLET = '0x1111111111111111111111111111111111111111';

function makeEnv(overrides: Partial<Bindings> = {}): Bindings {
  return {
    ...(env as unknown as Bindings),
    ENVIRONMENT: 'production',
    MINTING_ENABLED: 'true',
    ...overrides,
  };
}

interface BuiltApp {
  app: Hono<{ Bindings: Bindings; Variables: Variables }>;
}

function makeAuthedApp(sub: string, provider: MintingProvider): BuiltApp {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('accountKey', sub);
    c.set('isGuest', false);
    await next();
  });
  app.route(
    '/',
    createGameMintRouter(() => provider)
  );
  return { app };
}

function makeGuestApp(provider: MintingProvider): BuiltApp {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('isGuest', true);
    await next();
  });
  app.route(
    '/',
    createGameMintRouter(() => provider)
  );
  return { app };
}

async function fetchApp(
  built: BuiltApp,
  path: string,
  init: { method?: string; body?: Record<string, unknown> } = {},
  envOverrides: Partial<Bindings> = {}
): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await built.app.fetch(
    new Request(`https://example.com${path}`, {
      method: init.method ?? 'GET',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    }),
    makeEnv(envOverrides),
    ctx
  );
  await waitOnExecutionContext(ctx);
  return response;
}

async function seedWallet(sub: string, wallet: string): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO wallet_bindings (sub, wallet_address, verified_at, created_at)
     VALUES (?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(sub) DO UPDATE SET wallet_address = excluded.wallet_address`
  )
    .bind(sub, wallet)
    .run();
}

async function getIntent(referenceId: string): Promise<{
  sub: string;
  species: string;
  owner_address: string;
  status: string;
  token_id: string | null;
  error: string | null;
} | null> {
  return (env as unknown as Bindings).DB.prepare(
    `SELECT sub, species, owner_address, status, token_id, error FROM mint_intents WHERE reference_id = ?`
  )
    .bind(referenceId)
    .first();
}

async function getOwnedNft(sub: string, tokenId: string): Promise<{ species: string; owner_address: string } | null> {
  return (env as unknown as Bindings).DB.prepare(
    `SELECT species, owner_address FROM owned_nfts WHERE sub = ? AND token_id = ?`
  )
    .bind(sub, tokenId)
    .first();
}

beforeEach(async () => {
  const db = (env as unknown as Bindings).DB;
  await db.batch([
    db.prepare('DELETE FROM mint_intents'),
    db.prepare('DELETE FROM owned_nfts'),
    db.prepare('DELETE FROM wallet_bindings'),
  ]);
});

describe('POST /game/mint/request — gates', () => {
  it('rejects guests (no accountKey) with 401 and never calls the provider', async () => {
    const provider = new MockMintingProvider();
    const res = await fetchApp(makeGuestApp(provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog' },
    });

    expect(res.status).toBe(401);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'Unauthorized' });
    expect(provider.requestCount).toBe(0);
  });

  it('returns 403 when MINTING_ENABLED is unset', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider();
    const res = await fetchApp(
      makeAuthedApp(AUTH_SUB, provider),
      '/game/mint/request',
      { method: 'POST', body: { species: 'whiteDog' } },
      { MINTING_ENABLED: undefined }
    );

    expect(res.status).toBe(403);
    expect((await res.json()) as { error: string }).toEqual({ error: 'Minting is not enabled' });
    expect(provider.requestCount).toBe(0);
  });

  it('returns 409 when the account has no bound wallet', async () => {
    const provider = new MockMintingProvider();
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog' },
    });

    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({ error: 'Wallet not bound' });
    expect(provider.requestCount).toBe(0);
  });

  it('rejects an unknown familiar species with 400', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider();
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'notAFamiliar' },
    });

    expect(res.status).toBe(400);
    expect(provider.requestCount).toBe(0);
  });

  it.each([
    ['too long', 'r'.repeat(129)],
    ['invalid characters', 'ref with spaces'],
    ['path traversal', '../etc/passwd'],
    ['non-string', 12345],
  ])('rejects an invalid client referenceId (%s) with 400', async (_label, referenceId) => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider();
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });

    expect(res.status).toBe(400);
    expect((await res.json()) as unknown).toEqual({ error: 'Invalid referenceId' });
    expect(provider.requestCount).toBe(0);
  });

  it('accepts a 128-char id from the allowed alphabet', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider();
    const referenceId = 'a'.repeat(128);
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });

    expect(res.status).toBe(200);
    expect(provider.requestCount).toBe(1);
  });
});

describe('checkMintEntitlement — cap accounting', () => {
  it('does not count terminal failed intents toward the cap', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const db = (env as unknown as Bindings).DB;
    const rows = Array.from({ length: 50 }, (_, i) =>
      db
        .prepare(
          `INSERT INTO mint_intents (reference_id, sub, species, owner_address, status)
           VALUES (?, ?, 'whiteDog', ?, 'failed')`
        )
        .bind(`failed-${i}`, AUTH_SUB, WALLET)
    );
    await db.batch(rows);

    const provider = new MockMintingProvider();
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog' },
    });

    expect(res.status).toBe(200);
    expect(provider.requestCount).toBe(1);
  });

  it('counts pending intents toward the cap', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const db = (env as unknown as Bindings).DB;
    const rows = Array.from({ length: 50 }, (_, i) =>
      db
        .prepare(
          `INSERT INTO mint_intents (reference_id, sub, species, owner_address, status)
           VALUES (?, ?, 'whiteDog', ?, 'pending')`
        )
        .bind(`pending-${i}`, AUTH_SUB, WALLET)
    );
    await db.batch(rows);

    const provider = new MockMintingProvider();
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog' },
    });

    expect(res.status).toBe(403);
    expect((await res.json()) as unknown).toEqual({ error: 'Mint limit reached' });
    expect(provider.requestCount).toBe(0);
  });
});

describe('POST /game/mint/request — happy path and status transition', () => {
  it('write-ahead inserts, calls the provider once, then status succeeds and upserts owned_nfts', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider({
      getStatus: async () => ({ status: 'succeeded', tokenId: '4242' }),
    });

    const referenceId = 'ref-happy-path';
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });

    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ referenceId, status: 'pending' });
    expect(provider.requestCount).toBe(1);
    expect(provider.requests[0]).toMatchObject({ referenceId, ownerAddress: WALLET, species: 'whiteDog' });
    // Provider-agnostic metadata must carry the species and its traits.
    const sentMetadata = provider.requests[0].metadata as {
      name?: string;
      attributes?: Array<{ trait_type: string; value: unknown }>;
      image?: string;
    };
    expect(sentMetadata.name).toBe('White Dog');
    expect(sentMetadata.attributes).toContainEqual({ trait_type: 'species', value: 'whiteDog' });
    expect(sentMetadata.attributes).toContainEqual({ trait_type: 'rarity', value: 'Common' });
    expect(sentMetadata.attributes).toContainEqual({ trait_type: 'attack', value: 55 });
    // No metadata host configured in the test env → no image.
    expect(sentMetadata.image).toBeUndefined();

    // Intent persisted as pending BEFORE any provider status is known.
    const pendingIntent = await getIntent(referenceId);
    expect(pendingIntent).toMatchObject({ sub: AUTH_SUB, status: 'pending', species: 'whiteDog' });

    // No owned_nfts row until the mint is confirmed.
    expect(await getOwnedNft(AUTH_SUB, '4242')).toBeNull();

    const statusRes = await fetchApp(makeAuthedApp(AUTH_SUB, provider), `/game/mint/status/${referenceId}`);
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()) as unknown).toEqual({
      referenceId,
      status: 'succeeded',
      tokenId: '4242',
    });

    const succeededIntent = await getIntent(referenceId);
    expect(succeededIntent).toMatchObject({ status: 'succeeded', token_id: '4242' });

    const owned = await getOwnedNft(AUTH_SUB, '4242');
    expect(owned).toEqual({ species: 'whiteDog', owner_address: WALLET });
  });

  it('persists a failed status discovered at poll time', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider({
      getStatus: async () => ({ status: 'failed', error: 'metadata rejected' }),
    });

    const referenceId = 'ref-status-failed';
    await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'aquaSprite', referenceId },
    });

    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), `/game/mint/status/${referenceId}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ referenceId, status: 'failed', error: 'metadata rejected' });

    const intent = await getIntent(referenceId);
    expect(intent).toMatchObject({ status: 'failed', error: 'metadata rejected' });
  });

  it('returns 404 for a status request on an intent the account does not own', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider();
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/status/ref-does-not-exist');

    expect(res.status).toBe(404);
    expect(provider.statusCallCount).toBe(0);
  });
});

describe('POST /game/mint/request — idempotency', () => {
  it('calls the provider exactly once for a repeated referenceId and returns the same intent', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider();
    const referenceId = 'ref-idempotent';
    const app = makeAuthedApp(AUTH_SUB, provider);

    const first = await fetchApp(app, '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });
    const second = await fetchApp(app, '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()) as unknown).toEqual({ referenceId, status: 'pending' });
    expect(provider.requestCount).toBe(1);

    const { results } = await (env as unknown as Bindings).DB.prepare(
      'SELECT reference_id FROM mint_intents WHERE reference_id = ?'
    )
      .bind(referenceId)
      .all();
    expect(results).toHaveLength(1);
  });

  it('rejects cross-account referenceId reuse with 403 without calling the provider again', async () => {
    const OTHER_SUB = 'sub-mint-other';
    const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
    await seedWallet(AUTH_SUB, WALLET);
    await seedWallet(OTHER_SUB, OTHER_WALLET);

    const provider = new MockMintingProvider();
    const referenceId = 'ref-cross-account';

    const first = await fetchApp(makeAuthedApp(OTHER_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });
    expect(first.status).toBe(200);

    const second = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });
    expect(second.status).toBe(403);
    expect((await second.json()) as { error: string }).toMatchObject({
      error: 'referenceId belongs to another account',
    });
    expect(provider.requestCount).toBe(1);
  });

  it('fires two concurrent requests for the same referenceId and calls the provider exactly once', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider();
    const referenceId = 'ref-concurrent';
    const app = makeAuthedApp(AUTH_SUB, provider);

    const [first, second] = await Promise.all([
      fetchApp(app, '/game/mint/request', { method: 'POST', body: { species: 'whiteDog', referenceId } }),
      fetchApp(app, '/game/mint/request', { method: 'POST', body: { species: 'whiteDog', referenceId } }),
    ]);

    // Both callers see a consistent, successful intent...
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()) as unknown).toEqual({ referenceId, status: 'pending' });
    expect((await second.json()) as unknown).toEqual({ referenceId, status: 'pending' });
    // ...and the write-ahead claim let exactly one reach the provider.
    expect(provider.requestCount).toBe(1);

    const { results } = await (env as unknown as Bindings).DB.prepare(
      'SELECT reference_id FROM mint_intents WHERE reference_id = ?'
    )
      .bind(referenceId)
      .all();
    expect(results).toHaveLength(1);
  });
});

describe('POST /game/mint/request — provider failures', () => {
  it('keeps the intent pending (recoverable) and returns a generic 502 on a transient upstream error', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider({
      requestMint: async () => {
        throw new Error('upstream exploded');
      },
      getStatus: async () => ({ status: 'succeeded', tokenId: '9001' }),
    });

    const referenceId = 'ref-provider-error';
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });

    expect(res.status).toBe(502);
    expect(provider.requestCount).toBe(1);
    // Generic client message — the raw provider detail stays server-side.
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'Mint request failed' });

    const intent = await getIntent(referenceId);
    expect(intent?.status).toBe('pending');
    expect(intent?.error).toContain('upstream exploded');

    // Recoverable: a later status poll can still complete the mint.
    const statusRes = await fetchApp(makeAuthedApp(AUTH_SUB, provider), `/game/mint/status/${referenceId}`);
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()) as unknown).toEqual({ referenceId, status: 'succeeded', tokenId: '9001' });
    expect(await getOwnedNft(AUTH_SUB, '9001')).toMatchObject({ species: 'whiteDog', owner_address: WALLET });
  });

  it('treats an already-processed 409 as already-submitted: stays pending and resolves via status', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const provider = new MockMintingProvider({
      requestMint: async () => {
        throw new MintingProviderError('Mint request already processed', {
          status: 409,
          alreadyProcessed: true,
        });
      },
      getStatus: async () => ({ status: 'succeeded', tokenId: '777' }),
    });

    const referenceId = 'ref-already-processed';
    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog', referenceId },
    });

    // Not a terminal failure: the upstream already has the mint.
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ referenceId, status: 'pending' });
    expect((await getIntent(referenceId))?.status).toBe('pending');

    const statusRes = await fetchApp(makeAuthedApp(AUTH_SUB, provider), `/game/mint/status/${referenceId}`);
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()) as unknown).toEqual({ referenceId, status: 'succeeded', tokenId: '777' });
    expect(await getOwnedNft(AUTH_SUB, '777')).toMatchObject({ species: 'whiteDog' });
  });

  it('does not leak raw provider internals in the 502 body', async () => {
    await seedWallet(AUTH_SUB, WALLET);
    const secretish = 'IMMUTABLE_MINTING_API_KEY is unset (DisabledMintingProvider)';
    const provider = new MockMintingProvider({
      requestMint: async () => {
        throw new Error(secretish);
      },
    });

    const res = await fetchApp(makeAuthedApp(AUTH_SUB, provider), '/game/mint/request', {
      method: 'POST',
      body: { species: 'whiteDog' },
    });

    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain('IMMUTABLE_MINTING_API_KEY');
    expect(text).not.toContain(secretish);
  });
});
