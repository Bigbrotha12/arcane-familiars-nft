-- Migration 0003: Optimistic concurrency for game states + single active battle per user
-- Applied via: wrangler d1 migrations apply arcane-familiars --remote

-- Revision counter for conditional updates (lost-update protection)
ALTER TABLE game_states ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

-- Enforce at most one active battle per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_battles_anonymous_id_unique ON active_battles(anonymous_id);
