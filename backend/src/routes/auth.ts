import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { readBearerToken, verifyIdToken } from '../utils/auth';
import { internalError } from '../utils/http';
import { isValidEthAddress } from '../utils/imx';
import { recoverMessageAddress } from 'viem';

const authRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /auth/me
 * Session bootstrap/confirmation. Reads the Bearer Passport ID token (if
 * present), validates it, and reports whether the caller is authenticated,
 * the derived account key (`sub`), and any bound wallet address.
 * Unauthenticated by design — the client calls this before any /api/game/*
 * request to confirm its session.
 */
authRouter.get('/auth/me', async (c) => {
  const token = readBearerToken(c);
  if (!token) {
    return c.json({ authenticated: false });
  }
  const result = await verifyIdToken(token, c.env);
  if (!result) {
    return c.json({ authenticated: false });
  }

  const row = await c.env.DB.prepare('SELECT wallet_address FROM wallet_bindings WHERE sub = ?')
    .bind(result.sub)
    .first<{ wallet_address: string }>();

  return c.json({
    authenticated: true,
    sub: result.sub,
    walletAddress: row?.wallet_address ?? null,
  });
});

/**
 * POST /auth/adopt
 * Migrate a guest's persisted game to a Passport identity after sign-in, so
 * demo progress made while anonymous is not lost. Policy (locked): if the
 * account (`sub`) already has a saved game, do NOT overwrite — the guest game
 * is discarded. Only new players get their guest progress migrated.
 *
 * The guest save is moved first via a single authoritative UPDATE; any
 * in-progress battle and dungeon run then follow in one D1 batch. Every
 * no-op path returns 200 and is non-destructive, so the client can retry
 * safely.
 *
 * DESIGN NOTE: the guest UUID is a bearer capability — any authenticated user
 * who knows a valid guest UUID can adopt it; there is no proof of ownership
 * beyond possession of the id. UUID v4 makes guessing infeasible, and this is
 * an accepted trade-off for demo saves. No additional hardening is performed
 * here by design.
 */
authRouter.post('/auth/adopt', async (c) => {
  const token = readBearerToken(c);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await verifyIdToken(token, c.env);
  if (!result) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const sub = result.sub;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { anonymousId } = body as Record<string, unknown>;
  if (typeof anonymousId !== 'string' || anonymousId.length === 0) {
    return c.json({ error: 'Missing required field: anonymousId' }, 400);
  }

  // A guest UUID that equals the account key means there is no separate guest
  // row to migrate — the player is already on their account. Return no-guest
  // (a non-destructive no-op) rather than ever treating the account's own save
  // as adoptable guest data.
  if (anonymousId === sub) {
    return c.json({ adopted: false, reason: 'no-guest' });
  }

  try {
    // Only guest-marked rows are adoptable; an authenticated player's save is
    // never handed to another identity.
    const guest = await c.env.DB.prepare(
      'SELECT anonymous_id FROM game_states WHERE anonymous_id = ? AND is_anonymous = 1'
    )
      .bind(anonymousId)
      .first();

    if (!guest) {
      return c.json({ adopted: false, reason: 'no-guest' });
    }

    // Policy lock: if the account already has a saved game, keep it and leave
    // the guest row untouched.
    const account = await c.env.DB.prepare('SELECT anonymous_id FROM game_states WHERE anonymous_id = ?')
      .bind(sub)
      .first();
    if (account) {
      return c.json({ adopted: false, reason: 'existing-account' });
    }

    // Move the guest save FIRST and treat it as the authoritative gate. D1
    // batches commit 0-row matches without error, so inspecting a batch's
    // first result alone cannot guarantee the save moved before we migrate
    // battles/runs. A single-statement UPDATE is unambiguous: changes === 1
    // means the guest row existed and now belongs to the account.
    const move = await c.env.DB.prepare(
      'UPDATE game_states SET anonymous_id = ?, is_anonymous = 0 WHERE anonymous_id = ?'
    )
      .bind(sub, anonymousId)
      .run();

    if (move.meta.changes !== 1) {
      // Race guard: the guest row vanished between the check and the write
      // (e.g. a concurrent cleanup). Nothing was adopted and no battle/run
      // was migrated — the no-guest contract is preserved.
      return c.json({ adopted: false, reason: 'no-guest' });
    }

    // Save moved; migrate any in-progress battle and dungeon run in one
    // batch. A 0-row match here is fine (no battle/run in progress).
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE active_battles SET anonymous_id = ? WHERE anonymous_id = ?').bind(sub, anonymousId),
      c.env.DB.prepare('UPDATE dungeon_runs SET anonymous_id = ? WHERE anonymous_id = ?').bind(sub, anonymousId),
    ]);

    return c.json({ adopted: true, sub });
  } catch (error: unknown) {
    return internalError(c, error, 'Adopt guest game');
  }
});

// --- Wallet-binding nonce challenge ---

// One-time challenge TTL. Exported so the cron cleanup in `index.ts` derives
// its purge cutoff from the same source of truth.
export const CHALLENGE_TTL_SECONDS = 5 * 60; // 5 minutes

/**
 * Construct the deterministic message the client must sign for wallet binding.
 * The server builds this from the verified identity + wallet address so the
 * client cannot be tricked into signing an arbitrary payload.
 */
function buildChallengeMessage(sub: string, walletAddress: string, nonce: string): string {
  return `Arcane Familiars wallet binding\n\nsub: ${sub}\nwallet: ${walletAddress.toLowerCase()}\nnonce: ${nonce}`;
}

/**
 * POST /auth/wallet-challenge
 * Issue a one-time, short-lived, identity-bound nonce for wallet binding.
 * Requires a valid Passport Bearer token (401 otherwise). The returned
 * `message` is the exact string the client must sign via personal_sign.
 */
authRouter.post('/auth/wallet-challenge', async (c) => {
  const token = readBearerToken(c);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await verifyIdToken(token, c.env);
  if (!result) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const sub = result.sub;

  // Parse optional walletAddress from body (for pre-binding validation).
  let walletAddress: string | undefined;
  try {
    const body = await c.req.json<{ walletAddress?: string }>();
    if (typeof body?.walletAddress === 'string') {
      walletAddress = body.walletAddress;
    }
  } catch {
    // No body is fine — walletAddress is optional at challenge time.
  }

  // Generate a cryptographically random nonce.
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = [...nonceBytes].map((b) => b.toString(16).padStart(2, '0')).join('');

  const message = buildChallengeMessage(sub, walletAddress ?? '0x0000000000000000000000000000000000000000', nonce);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();

  // Replace any existing challenge for this sub (one active challenge at a time).
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM wallet_challenges WHERE sub = ?').bind(sub),
    c.env.DB.prepare(
      `INSERT INTO wallet_challenges (sub, nonce, message, wallet_address, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(sub, nonce, message, walletAddress ?? null, createdAt),
  ]);

  return c.json({ nonce, message, expiresAt });
});

/**
 * POST /auth/wallet
 * Bind a zkEVM wallet address to the authenticated Passport identity.
 * The client signs a server-issued challenge message, and this endpoint
 * verifies the signature matches the claimed address AND that the message
 * was the one the server constructed for this sub+nonce.
 */
authRouter.post('/auth/wallet', async (c) => {
  const token = readBearerToken(c);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await verifyIdToken(token, c.env);
  if (!result) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const sub = result.sub;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { walletAddress, signature, nonce, message } = body as Record<string, unknown>;

  if (
    typeof walletAddress !== 'string' ||
    typeof signature !== 'string' ||
    typeof nonce !== 'string' ||
    typeof message !== 'string'
  ) {
    return c.json({ error: 'Missing required fields: walletAddress, signature, nonce, message' }, 400);
  }

  // Validate address format (0x + 40 hex chars, checksum-agnostic).
  if (!isValidEthAddress(walletAddress)) {
    return c.json({ error: 'Invalid wallet address format' }, 400);
  }

  // Load and consume the pending challenge for this sub.
  const challenge = await c.env.DB.prepare('SELECT nonce, message, created_at FROM wallet_challenges WHERE sub = ?')
    .bind(sub)
    .first<{ nonce: string; message: string; created_at: string }>();

  // Always consume (delete) the challenge row regardless of outcome.
  if (challenge) {
    await c.env.DB.prepare('DELETE FROM wallet_challenges WHERE sub = ?').bind(sub).run();
  }

  if (!challenge) {
    return c.json({ error: 'Challenge required or expired' }, 400);
  }

  // Check TTL expiry.
  const createdAt = new Date(challenge.created_at).getTime();
  if (Date.now() - createdAt > CHALLENGE_TTL_SECONDS * 1000) {
    return c.json({ error: 'Challenge required or expired' }, 400);
  }

  // Verify the nonce matches the server-issued one.
  if (nonce !== challenge.nonce) {
    return c.json({ error: 'Invalid nonce' }, 400);
  }

  // Verify the client-signed message matches the server-constructed message.
  if (message !== challenge.message) {
    return c.json({ error: 'Message does not match server challenge' }, 400);
  }

  // Recover the signer from the EIP-191 personal_sign signature.
  let recoveredAddress: string;
  try {
    recoveredAddress = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return c.json({ error: 'Signature verification failed' }, 400);
  }

  // Case-insensitive comparison of recovered address vs claimed address.
  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    return c.json({ error: 'Signature does not match address' }, 400);
  }

  // Upsert: bind or re-bind wallet to this Passport identity.
  // UNIQUE constraint on wallet_address prevents two identities from
  // claiming the same wallet.
  try {
    await c.env.DB.prepare(
      `INSERT INTO wallet_bindings (sub, wallet_address, verified_at, created_at)
       VALUES (?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(sub) DO UPDATE SET wallet_address = excluded.wallet_address,
                                      verified_at = datetime('now')`
    )
      .bind(sub, walletAddress)
      .run();
  } catch (err: unknown) {
    // SQLite UNIQUE constraint violation on wallet_address
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Wallet already bound to another account' }, 409);
    }
    throw err;
  }

  return c.json({ bound: true, walletAddress });
});

export default authRouter;
