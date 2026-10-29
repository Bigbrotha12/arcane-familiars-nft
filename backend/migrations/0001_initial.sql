-- Migration 0001: Initial schema for Arcane Familiars backend
-- Applied via: wrangler d1 migrations apply arcane-familiars --env production --remote

-- Familiar type catalog
CREATE TABLE IF NOT EXISTS familiars (
  familiar_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  affinity TEXT NOT NULL CHECK(affinity IN ('Light', 'Dark', 'Fire', 'Water', 'Earth', 'Wind')),
  hp INTEGER NOT NULL DEFAULT 0,
  mp INTEGER NOT NULL DEFAULT 0,
  attack INTEGER NOT NULL DEFAULT 0,
  defense INTEGER NOT NULL DEFAULT 0,
  arcane INTEGER NOT NULL DEFAULT 0,
  speed INTEGER NOT NULL DEFAULT 0,
  ability_1 TEXT NOT NULL DEFAULT '',
  ability_2 TEXT NOT NULL DEFAULT '',
  ability_3 TEXT NOT NULL DEFAULT '',
  ability_4 TEXT NOT NULL DEFAULT '',
  rarity TEXT NOT NULL CHECK(rarity IN ('common', 'uncommon', 'rare', 'secret', 'legendary')),
  generation INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Keeper type catalog
CREATE TABLE IF NOT EXISTS keepers (
  keeper_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  levels INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ability definitions
CREATE TABLE IF NOT EXISTS abilities (
  ability_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  effect TEXT NOT NULL DEFAULT '[]',  -- JSON array stored as TEXT
  drawback TEXT NOT NULL DEFAULT '[]',  -- JSON array stored as TEXT
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users (auth cache)
CREATE TABLE IF NOT EXISTS users (
  eth_address TEXT PRIMARY KEY,
  last_auth_timestamp INTEGER,
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mint operation queue
CREATE TABLE IF NOT EXISTS minting_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eth_address TEXT NOT NULL,
  familiar_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'minted', 'failed')),
  token_id TEXT,
  tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (familiar_id) REFERENCES familiars(familiar_id)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_minting_queue_eth_address ON minting_queue(eth_address);
CREATE INDEX IF NOT EXISTS idx_minting_queue_status ON minting_queue(status);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
