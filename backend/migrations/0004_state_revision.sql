-- Migration 0004: Optimistic concurrency for game states + single active battle per user
-- Applied via: wrangler d1 migrations apply arcane-familiars --env production --remote

-- Revision counter for conditional updates (lost-update protection)
ALTER TABLE game_states ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

-- Remove duplicate active battles per user (abandoned sessions from before
-- this constraint existed), keeping only the most recent battle per user.
DELETE FROM active_battles
WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM active_battles GROUP BY anonymous_id
);

-- Enforce at most one active battle per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_battles_anonymous_id_unique ON active_battles(anonymous_id);

