import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';

/**
 * BC2 schema tests for migrations 0011 (mint_intents) and 0012 (owned_nfts).
 *
 * Migrations are applied to the shared in-memory D1 by
 * test/apply-migrations.ts before this suite runs. These assert that the
 * tables exist and that the idempotency / enum invariants are enforced by the
 * database itself.
 */

function insertMintIntent(referenceId: string, status = 'pending'): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO mint_intents (reference_id, sub, species, owner_address, status)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(referenceId, 'sub-mint-1', 'emberling', '0xabc', status)
    .run();
}

function insertOwnedNft(sub: string, tokenId: string): Promise<unknown> {
  return env.DB.prepare(
    `INSERT INTO owned_nfts (sub, token_id, species, owner_address)
     VALUES (?, ?, ?, ?)`
  )
    .bind(sub, tokenId, 'emberling', '0xabc')
    .run();
}

describe('mint_intents / owned_nfts schema', () => {
  it('applied both migrations (tables exist)', async () => {
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('mint_intents', 'owned_nfts')`
    ).all<{ name: string }>();
    expect(results.map((row) => row.name).sort()).toEqual(['mint_intents', 'owned_nfts']);
  });

  it('rejects a duplicate mint_intents.reference_id', async () => {
    await insertMintIntent('ref-dup');
    await expect(insertMintIntent('ref-dup')).rejects.toThrow();
  });

  it('rejects a duplicate owned_nfts (sub, token_id)', async () => {
    await insertOwnedNft('sub-owned-1', 'token-1');
    await expect(insertOwnedNft('sub-owned-1', 'token-1')).rejects.toThrow();
  });

  it('rejects an invalid mint_intents.status via the CHECK constraint', async () => {
    await expect(insertMintIntent('ref-bad-status', 'not-a-status')).rejects.toThrow();
  });
});
