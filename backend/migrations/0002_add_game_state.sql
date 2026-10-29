-- Migration 0002: Game state tables for Arcane Familiars
-- Applied via: wrangler d1 migrations apply arcane-familiars --env production --remote

-- Game save states per user
CREATE TABLE IF NOT EXISTS game_states (
  anonymous_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Active battle sessions
CREATE TABLE IF NOT EXISTS active_battles (
  battle_id TEXT PRIMARY KEY,
  anonymous_id TEXT NOT NULL,
  battle_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- In-progress dungeon data
CREATE TABLE IF NOT EXISTS dungeon_runs (
  id TEXT PRIMARY KEY,
  anonymous_id TEXT NOT NULL,
  area_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Historical battle turns
CREATE TABLE IF NOT EXISTS battle_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_session_id TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  log_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_active_battles_anonymous_id ON active_battles(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_runs_anonymous_id ON dungeon_runs(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_battle_log_battle_session_id ON battle_log(battle_session_id);
