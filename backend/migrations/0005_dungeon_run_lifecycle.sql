-- Migration 0004: Dungeon run lifecycle + stale row cleanup support
-- Applied via: wrangler d1 migrations apply arcane-familiars --remote

ALTER TABLE dungeon_runs ADD COLUMN ended_at TEXT;
