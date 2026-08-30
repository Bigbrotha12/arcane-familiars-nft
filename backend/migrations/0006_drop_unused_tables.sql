-- Migration 0005: Drop tables with no application usage
-- Applied via: wrangler d1 migrations apply arcane-familiars --remote

-- battle_log: written by nothing; battle history is not implemented.
DROP TABLE IF EXISTS battle_log;

-- keepers / minting_queue: no route reads or writes either table.
DROP TABLE IF EXISTS minting_queue;
DROP TABLE IF EXISTS keepers;
