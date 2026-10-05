-- Migration 0011: Mint intents — idempotent minting records for the hosted
-- Minting-API reference_id flow and the EIP-712 custom-contract fallback.
-- Applied via: wrangler d1 migrations apply arcane-familiars --env production --remote

CREATE TABLE IF NOT EXISTS mint_intents (
  reference_id TEXT NOT NULL PRIMARY KEY,
  sub TEXT NOT NULL,
  species TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  -- Reserved for the EIP-712 custom-contract fallback (option B): the on-chain
  -- mint nonce. Unused by the hosted Minting-API reference_id flow.
  nonce TEXT,
  token_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mint_intents_sub_status ON mint_intents (sub, status);
CREATE INDEX IF NOT EXISTS idx_mint_intents_status_created ON mint_intents (status, created_at);
