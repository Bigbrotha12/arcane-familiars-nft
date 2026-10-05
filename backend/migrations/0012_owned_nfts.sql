-- Migration 0012: Owned NFTs — per-account ownership cache keyed by the
-- account key (sub) rather than the wallet address, so a wallet rebind is
-- handled by re-sync instead of a data migration.
-- Applied via: wrangler d1 migrations apply arcane-familiars --env production --remote

CREATE TABLE IF NOT EXISTS owned_nfts (
  sub TEXT NOT NULL,
  token_id TEXT NOT NULL,
  species TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sub, token_id)
);
