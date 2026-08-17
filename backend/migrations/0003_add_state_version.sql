-- Migration 0003: Optimistic concurrency for game_states.
-- The version column is bumped on every write; conditional writes (WHERE version = ?)
-- reject stale/clobbering updates. Existing rows default to version 1.
ALTER TABLE game_states ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
