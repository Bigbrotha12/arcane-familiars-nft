import { describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { privateKeyToAccount } from "viem/accounts";
import type { Bindings, Variables } from "../src/types";
// The `?wallet-binding-test` query forces a fresh module graph in the test
// bundle, exactly like `?auth-adopt-test` in auth-adopt.test.ts. Without it
// the import resolves to the main Worker's pre-bundled module, where the
// `vi.mock` on ../src/utils/auth below is not applied.
import authRouter from "../src/routes/auth.ts?wallet-binding-test";

/**
 * Focused tests for the wallet-binding nonce flow (POST /auth/wallet-challenge
 * and POST /auth/wallet).
 *
 * Verifying a real Passport ID token against Immutable's remote JWKS is not
 * possible in the test harness (same constraint as auth-adopt.test.ts). We stub
 * `verifyIdToken` (keeping a real `readBearerToken`) so the auth gate is
 * deterministic: a fixed token maps to a fixed `sub`, anything else is 401.
 *
 * Signatures are produced with a deterministic viem ECDSA keypair (RFC 6979 —
 * no randomness), so the whole flow is CI-stable: challenge → sign the exact
 * server message → bind. The route logic and the shared in-memory D1
 * (migrations applied by apply-migrations.ts) run unchanged.
 */

vi.mock("../src/utils/auth", () => ({
  readBearerToken: (c: { req: { header: (name: string) => string | undefined } }) => {
    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) return null;
    return header.slice("Bearer ".length).trim();
  },
  verifyIdToken: vi.fn(async (token: string) => {
    if (token === "wallet-token-a") return { sub: "sub-wallet-a" };
    if (token === "wallet-token-b") return { sub: "sub-wallet-b" };
    return null;
  }),
}));

// Deterministic ECDSA keypairs (fixed private keys — RFC 6979 makes the
// resulting signatures reproducible, so these are CI-stable, not secrets).
const accountA = privateKeyToAccount(
  "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
);
const accountB = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: "production" };
}

async function fetchAuth(
  path: string,
  method: string,
  token: string | null,
  body: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await authRouter.fetch(
    new Request(`https://example.com${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    makeEnv(),
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function challengeFor(token: string, walletAddress: string): Promise<{ nonce: string; message: string }> {
  const res = await fetchAuth("/auth/wallet-challenge", "POST", token, { walletAddress });
  expect(res.status).toBe(200);
  return (await res.json()) as { nonce: string; message: string };
}

describe("POST /auth/wallet-challenge + /auth/wallet auth gate", () => {
  it("rejects wallet-challenge without a Bearer token", async () => {
    const res = await fetchAuth("/auth/wallet-challenge", "POST", null, {});
    expect(res.status).toBe(401);
  });

  it("rejects wallet-challenge with an invalid token", async () => {
    const res = await fetchAuth("/auth/wallet-challenge", "POST", "not-a-real-token", {});
    expect(res.status).toBe(401);
  });

  it("rejects wallet bind without a Bearer token", async () => {
    const res = await fetchAuth("/auth/wallet", "POST", null, {
      walletAddress: accountA.address,
      message: "x",
      signature: "0x00",
      nonce: "x",
    });
    expect(res.status).toBe(401);
  });
});

describe("wallet binding nonce flow", () => {
  it("returns 400 when binding with no prior challenge for the sub", async () => {
    const res = await fetchAuth("/auth/wallet", "POST", "wallet-token-a", {
      walletAddress: accountA.address,
      message: "no challenge was issued",
      signature: "0x00",
      nonce: "never-issued",
    });
    expect(res.status).toBe(400);
  });

  it("binds a wallet after signing the exact server-issued message", async () => {
    const { nonce, message } = await challengeFor("wallet-token-a", accountA.address);

    // The challenge message is derived from the verified sub + requested wallet.
    expect(message).toContain("sub-wallet-a");
    expect(message).toContain(accountA.address.toLowerCase());

    const signature = await accountA.signMessage({ message });
    const res = await fetchAuth("/auth/wallet", "POST", "wallet-token-a", {
      walletAddress: accountA.address,
      message,
      signature,
      nonce,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bound: true, walletAddress: accountA.address });

    const row = await env.DB
      .prepare("SELECT wallet_address FROM wallet_bindings WHERE sub = ?")
      .bind("sub-wallet-a")
      .first<{ wallet_address: string }>();
    expect(row?.wallet_address).toBe(accountA.address);
  });

  it("rejects a signature over a tampered message", async () => {
    const { nonce, message } = await challengeFor("wallet-token-a", accountA.address);

    const tampered = `${message}\n    tampered`;
    const signature = await accountA.signMessage({ message: tampered });
    const res = await fetchAuth("/auth/wallet", "POST", "wallet-token-a", {
      walletAddress: accountA.address,
      message: tampered,
      signature,
      nonce,
    });
    expect(res.status).toBe(400);
  });

  it("rejects a signature from the wrong key (recovered != claimed wallet)", async () => {
    const { nonce, message } = await challengeFor("wallet-token-a", accountA.address);

    // Sign the correct server message with a DIFFERENT key.
    const signature = await accountB.signMessage({ message });
    const res = await fetchAuth("/auth/wallet", "POST", "wallet-token-a", {
      walletAddress: accountA.address,
      message,
      signature,
      nonce,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Signature does not match address" });
  });

  it("consumes the nonce: replaying the same challenge is rejected", async () => {
    const { nonce, message } = await challengeFor("wallet-token-a", accountA.address);
    const signature = await accountA.signMessage({ message });

    const first = await fetchAuth("/auth/wallet", "POST", "wallet-token-a", {
      walletAddress: accountA.address,
      message,
      signature,
      nonce,
    });
    expect(first.status).toBe(200);

    const replay = await fetchAuth("/auth/wallet", "POST", "wallet-token-a", {
      walletAddress: accountA.address,
      message,
      signature,
      nonce,
    });
    expect(replay.status).toBe(400);
  });

  it("rejects a second sub binding the same wallet (409 UNIQUE conflict)", async () => {
    // accountA.address is already bound to sub-wallet-a by the success test.
    const { nonce, message } = await challengeFor("wallet-token-b", accountA.address);
    const signature = await accountA.signMessage({ message });

    const res = await fetchAuth("/auth/wallet", "POST", "wallet-token-b", {
      walletAddress: accountA.address,
      message,
      signature,
      nonce,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Wallet already bound to another account" });
  });
});