-- Migration 0005: Dungeon run lifecycle + stale row cleanup support
-- Applied via: wrangler d1 migrations apply arcane-familiars --env production --remote

ALTER TABLE dungeon_runs ADD COLUMN ended_at TEXT;
