-- Migration 0002: Game state tables for Arcane Familiars
-- Applied via: wrangler d1 migrations apply arcane-familiars --remote

-- Game save states per user
CREATE TABLE IF NOT EXISTS game_states (
  id TEXT PRIMARY KEY,
  anonymous_id TEXT NOT NULL,
  state_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ephemeral battle data
CREATE TABLE IF NOT EXISTS battle_sessions (
  id TEXT PRIMARY KEY,
  anonymous_id TEXT NOT NULL,
  state_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- In-progress dungeon data
CREATE TABLE IF NOT EXISTS dungeon_runs (
  id TEXT PRIMARY KEY,
  anonymous_id TEXT NOT NULL,
  area_id TEXT NOT NULL,
  state_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
CREATE INDEX IF NOT EXISTS idx_game_states_anonymous_id ON game_states(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_battle_sessions_anonymous_id ON battle_sessions(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_runs_anonymous_id ON dungeon_runs(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_battle_log_battle_session_id ON battle_log(battle_session_id);
