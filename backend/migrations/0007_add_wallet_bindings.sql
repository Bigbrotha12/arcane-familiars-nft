-- Migration 0007: Wallet bindings table for Passport sub ↔ zkEVM address
-- Applied via: wrangler d1 migrations apply arcane-familiars --env production --remote

CREATE TABLE IF NOT EXISTS wallet_bindings (
  sub TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wallet_bindings_address ON wallet_bindings(wallet_address);
