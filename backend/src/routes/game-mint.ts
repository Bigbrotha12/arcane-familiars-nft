import { Hono } from 'hono';
import { Affinity, Rarity, getFamiliar } from '@arcane-familiars/game-logic';
import type { Bindings, Variables } from '../types';
import { getErrorMessage, internalError, readBody } from '../utils/http';
import { generateId } from '../utils/uuid';
import { MintingProviderError, type MintingProvider, type MintStatusResult } from '../services/minting/provider';

/**
 * BC2 mint seam: authenticated mint request + status routes.
 *
 * The router is built by a factory so `index.ts` can mount the real
 * `createMintingProvider` factory while tests inject a `MockMintingProvider`.
 * The provider is resolved per request (cheap, stateless), never at module
 * load.
 *
 * Write-ahead idempotency: a `mint_intents` row is inserted for `reference_id`
 * BEFORE the provider is called. A retry with the same id finds the existing
 * row and returns its current status without re-submitting upstream. The row
 * also doubles as the ownership guard — a `reference_id` first used by another
 * `sub` is rejected 403.
 */

// TODO(Q2): the owner's mint-sink decision is pending. Until then the only
// entitlement rules are the global `MINTING_ENABLED` flag and a constant
// per-account cap. Do NOT invent currency costs here.
const MINT_CAP_PLACEHOLDER = 50;

type MintIntentStatus = 'pending' | 'succeeded' | 'failed';

interface MintIntentRow {
  reference_id: string;
  sub: string;
  species: string;
  owner_address: string;
  status: MintIntentStatus;
  token_id: string | null;
  error: string | null;
}

interface MintResponseBody {
  referenceId: string;
  status: MintIntentStatus;
  tokenId?: string;
  error?: string;
}

function toMintResponse(row: MintIntentRow): MintResponseBody {
  const body: MintResponseBody = { referenceId: row.reference_id, status: row.status };
  if (row.token_id) body.tokenId = row.token_id;
  // Only terminal failures expose their reason. The `error` column also holds
  // transient transport detail on pending rows, which is operator-facing only.
  if (row.status === 'failed' && row.error) body.error = row.error;
  return body;
}

/**
 * Build provider-agnostic NFT metadata for a familiar species. The hosted
 * Minting API (and any future adapter) receives this as the asset `metadata`;
 * keeping it out of the adapter means switching providers never drops traits.
 *
 * `image` is only included when `NFT_METADATA_BASE_URI` is configured, so
 * environments without a metadata host still mint valid (imageless) tokens.
 */
export function buildMintMetadata(species: string, metadataBaseUri?: string): Record<string, unknown> | undefined {
  const familiar = getFamiliar(species);
  if (!familiar) return undefined;

  const attributes = [
    { trait_type: 'species', value: species },
    { trait_type: 'rarity', value: Rarity[familiar.rarity] },
    { trait_type: 'affinity', value: Affinity[familiar.affinity] },
    ...Object.entries(familiar.stats).map(([stat, value]) => ({ trait_type: stat, value })),
  ];

  const metadata: Record<string, unknown> = { name: familiar.name, attributes };
  if (metadataBaseUri) {
    metadata.image = `${metadataBaseUri.replace(/\/$/, '')}/${species}.png`;
  }
  return metadata;
}

/**
 * Entitlement/economy hook (TODO Q2). This is the single named gate the mint
 * request path consults. Today it only:
 *   1. requires `MINTING_ENABLED === 'true'`, and
 *   2. enforces a constant per-account cap placeholder.
 * A future mint-sink decision (currency costs, token-gated access, etc.)
 * extends this function only — routes stay unchanged.
 */
export async function checkMintEntitlement(
  env: Bindings,
  sub: string
): Promise<{ allowed: true } | { allowed: false; status: 403; error: string }> {
  if (env.MINTING_ENABLED !== 'true') {
    return { allowed: false, status: 403, error: 'Minting is not enabled' };
  }

  // Count only non-terminal intents: a terminal `failed` mint (e.g. rejected
  // metadata) must not consume the cap forever. In-flight `pending` mints
  // (including recoverable transient failures) and confirmed `succeeded` mints
  // legitimately count against the cap.
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM mint_intents WHERE sub = ? AND status IN ('pending', 'succeeded')`
  )
    .bind(sub)
    .first<{ count: number }>();
  if ((row?.count ?? 0) >= MINT_CAP_PLACEHOLDER) {
    return { allowed: false, status: 403, error: 'Mint limit reached' };
  }

  return { allowed: true };
}

export function createGameMintRouter(
  providerFactory: (env: Bindings) => MintingProvider
): Hono<{ Bindings: Bindings; Variables: Variables }> {
  const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

  /**
   * POST /game/mint/request
   *
   * Body: { species: string, referenceId?: string }
   * Success: 200 { referenceId, status: 'pending' }
   *   401 guests / unauthenticated
   *   403 minting disabled, cap reached, or cross-account referenceId reuse
   *   409 no bound wallet
   *   502 provider transport/upstream failure (intent stays `pending`, so a
   *       later status poll can still resolve/recover it)
   */
  router.post('/game/mint/request', async (c) => {
    try {
      const sub = c.get('accountKey');
      if (!sub) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const entitlement = await checkMintEntitlement(c.env, sub);
      if (!entitlement.allowed) {
        return c.json({ error: entitlement.error }, entitlement.status);
      }

      const body = await readBody<{ species?: string; referenceId?: unknown }>(c);
      if (!body) {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }

      const species = body.species;
      if (typeof species !== 'string' || !getFamiliar(species)) {
        return c.json({ error: 'Unknown familiar species' }, 400);
      }

      // Client-supplied ids become a global primary key, so they must be
      // bounded and URL/DB-safe. Omitted (or empty) ids are server-generated.
      const providedReferenceId = body.referenceId;
      let referenceId: string;
      if (providedReferenceId === undefined || providedReferenceId === null || providedReferenceId === '') {
        referenceId = generateId();
      } else if (
        typeof providedReferenceId !== 'string' ||
        providedReferenceId.length > 128 ||
        !/^[A-Za-z0-9_-]+$/.test(providedReferenceId)
      ) {
        return c.json({ error: 'Invalid referenceId' }, 400);
      } else {
        referenceId = providedReferenceId;
      }

      const binding = await c.env.DB.prepare('SELECT wallet_address FROM wallet_bindings WHERE sub = ?')
        .bind(sub)
        .first<{ wallet_address: string }>();
      if (!binding?.wallet_address) {
        return c.json({ error: 'Wallet not bound' }, 409);
      }
      const ownerAddress = binding.wallet_address;

      // Write-ahead: claim the reference_id before touching the provider. A
      // conflicting insert (retry or another account) writes nothing.
      const insert = await c.env.DB.prepare(
        `INSERT INTO mint_intents (reference_id, sub, species, owner_address, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
         ON CONFLICT(reference_id) DO NOTHING`
      )
        .bind(referenceId, sub, species, ownerAddress)
        .run();

      const existing = await c.env.DB.prepare(
        `SELECT reference_id, sub, species, owner_address, status, token_id, error
         FROM mint_intents WHERE reference_id = ?`
      )
        .bind(referenceId)
        .first<MintIntentRow>();

      if (!existing) {
        // The row was inserted then vanished between statements — unreachable
        // in practice, but never call the provider without a durable intent.
        console.error(`[${c.get('requestId')}] mint intent disappeared after write-ahead insert: ${referenceId}`);
        return c.json({ error: 'Internal server error', requestId: c.get('requestId') }, 500);
      }

      // The reference_id is globally unique; a mismatch means another account
      // already owns it. Never let one account poll another's mint.
      if (existing.sub !== sub) {
        return c.json({ error: 'referenceId belongs to another account' }, 403);
      }

      // Idempotency: only a freshly inserted intent may hit the provider.
      if ((insert.meta.changes ?? 0) === 0) {
        return c.json(toMintResponse(existing), 200);
      }

      // Provider-agnostic metadata is built here (not in the adapter) so the
      // species/rarity/stats survive any provider switch.
      const metadata = buildMintMetadata(species, c.env.NFT_METADATA_BASE_URI);

      try {
        await providerFactory(c.env).requestMint({ referenceId, ownerAddress, species, metadata });
      } catch (error: unknown) {
        const message = getErrorMessage(error);

        if (error instanceof MintingProviderError && error.alreadyProcessed) {
          // Upstream already accepted a mint for this reference_id — a benign
          // "already submitted" signal, NOT a failure. Keep the intent pending
          // so the status route resolves it (and upserts owned_nfts) instead of
          // short-circuiting forever on a terminal `failed` row.
          console.warn(`[${c.get('requestId')}] mint request already processed upstream: ${referenceId}`);
          return c.json({ referenceId, status: 'pending' }, 200);
        }

        // A transport/timeout/5xx failure must not terminalize the intent:
        // only `getStatus` returning `failed` may do that. Persist the detail
        // for operators and keep `pending` so the mint stays recoverable.
        console.error(`[${c.get('requestId')}] mint request provider error:`, message);
        await c.env.DB.prepare(`UPDATE mint_intents SET error = ?, updated_at = datetime('now') WHERE reference_id = ?`)
          .bind(message, referenceId)
          .run();

        return c.json({ error: 'Mint request failed', requestId: c.get('requestId') }, 502);
      }

      return c.json({ referenceId, status: 'pending' }, 200);
    } catch (error: unknown) {
      return internalError(c, error, 'Mint request');
    }
  });

  /**
   * GET /game/mint/status/:referenceId
   *
   * Owned-intent lookup only (404 otherwise). While pending, polls the provider
   * and, on success, atomically updates the intent and upserts the owned_nfts
   * cache in one D1 batch.
   *
   * Success: 200 { referenceId, status, tokenId?, error? }
   *   401 unauthenticated, 404 not found/not owned, 502 upstream failure
   */
  router.get('/game/mint/status/:referenceId', async (c) => {
    try {
      const sub = c.get('accountKey');
      if (!sub) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const referenceId = c.req.param('referenceId');
      const row = await c.env.DB.prepare(
        `SELECT reference_id, sub, species, owner_address, status, token_id, error
         FROM mint_intents WHERE reference_id = ? AND sub = ?`
      )
        .bind(referenceId, sub)
        .first<MintIntentRow>();

      if (!row) {
        return c.json({ error: 'Mint intent not found' }, 404);
      }

      // Terminal states are served from the persisted row without an upstream
      // call, so repeated polling cannot re-trigger anything.
      if (row.status !== 'pending') {
        return c.json(toMintResponse(row), 200);
      }

      let result: MintStatusResult;
      try {
        result = await providerFactory(c.env).getStatus(referenceId);
      } catch (error: unknown) {
        // Upstream/internal detail stays server-side; the client gets a generic
        // retryable message plus the request id for correlation.
        console.error(`[${c.get('requestId')}] mint status provider error:`, getErrorMessage(error));
        return c.json({ error: 'Mint status unavailable', requestId: c.get('requestId') }, 502);
      }

      if (result.status === 'succeeded') {
        if (!result.tokenId) {
          // A success without a token id is an upstream contract violation;
          // never write a tokenless owned_nfts row.
          console.error(`[${c.get('requestId')}] mint ${referenceId} succeeded without a token id`);
          return c.json({ error: 'Mint succeeded without a token id' }, 502);
        }

        // TODO(blockchain-followup): the indexer → owned_nfts sync/reconciliation
        // (authoritative on-chain ownership re-sync) is deferred. Today
        // owned_nfts is populated only by this mint-status upsert path.
        await c.env.DB.batch([
          c.env.DB.prepare(
            `UPDATE mint_intents SET status = 'succeeded', token_id = ?, updated_at = datetime('now')
             WHERE reference_id = ? AND sub = ?`
          ).bind(result.tokenId, referenceId, sub),
          c.env.DB.prepare(
            `INSERT INTO owned_nfts (sub, token_id, species, owner_address, synced_at)
             VALUES (?, ?, ?, ?, datetime('now'))
             ON CONFLICT(sub, token_id) DO UPDATE SET
               species = excluded.species,
               owner_address = excluded.owner_address,
               synced_at = excluded.synced_at`
          ).bind(sub, result.tokenId, row.species, row.owner_address),
        ]);

        return c.json({ referenceId, status: 'succeeded', tokenId: result.tokenId }, 200);
      }

      if (result.status === 'failed') {
        const error = result.error ?? 'Minting failed';
        await c.env.DB.prepare(
          `UPDATE mint_intents SET status = 'failed', error = ?, updated_at = datetime('now')
           WHERE reference_id = ? AND sub = ?`
        )
          .bind(error, referenceId, sub)
          .run();
        return c.json({ referenceId, status: 'failed', error }, 200);
      }

      return c.json({ referenceId, status: 'pending' }, 200);
    } catch (error: unknown) {
      return internalError(c, error, 'Mint status');
    }
  });

  return router;
}
