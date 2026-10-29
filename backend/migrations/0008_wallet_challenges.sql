-- Migration 0008: Server-issued nonce challenges for wallet binding.
-- Each row stores a fresh, one-time, identity-bound challenge used by
-- POST /auth/wallet to prevent replay and cross-account wallet grabs.

CREATE TABLE IF NOT EXISTS wallet_challenges (
  sub TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  wallet_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
