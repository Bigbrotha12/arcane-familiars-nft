-- 0009_add_guest_marker.sql
-- Mark guest (anonymous) game states so stale guest rows can be cleaned up.
ALTER TABLE game_states ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_game_states_guest_ttl ON game_states (is_anonymous, updated_at);