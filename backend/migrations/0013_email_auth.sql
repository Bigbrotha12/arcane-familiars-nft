-- 0013_email_auth.sql
-- Replace Passport/wallet identity with local email/password accounts.
-- Destructive by design: the blockchain track is being removed.
--
-- Existing game_states rows that were keyed by a Passport `sub` are not
-- automatically claimable. Back them up before applying this in an environment
-- where those saves matter; new accounts use a fresh `user_id` key.

DROP TABLE IF EXISTS wallet_challenges;
DROP TABLE IF EXISTS wallet_bindings;
DROP TABLE IF EXISTS mint_intents;
DROP TABLE IF EXISTS owned_nfts;

-- Legacy 0001 users table used eth_address as the primary key and was never
-- wired to an auth flow. Recreate it for email/password accounts.
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
