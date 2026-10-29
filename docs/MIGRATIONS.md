# Production D1 Migration Audit

Date: 2026-10-29
Snapshot: `docs/d1-snapshot-2026-10-29.sql` (local only; contains player and IP data, do not commit)
Production database: `arcane-familiars` (per `backend/wrangler.jsonc`)

## Finding: the repo and production are on different migration histories

The production `d1_migrations` table lists ten migrations. The repository only contains
six files, and the names do not line up after `0003`.

| # | Production migration | Present in repo? |
|---|----------------------|------------------|
| 1 | `0001_initial.sql` | yes |
| 2 | `0002_add_game_state.sql` | yes |
| 3 | `0003_add_state_version.sql` | yes |
| 4 | `0004_state_revision.sql` | no (repo has `0003_state_revision.sql`) |
| 5 | `0005_dungeon_run_lifecycle.sql` | no (repo has `0004_dungeon_run_lifecycle.sql`) |
| 6 | `0006_drop_unused_tables.sql` | no (repo has `0005_drop_unused_tables.sql`) |
| 7 | `0007_add_wallet_bindings.sql` | no |
| 8 | `0008_wallet_challenges.sql` | no |
| 9 | `0009_add_guest_marker.sql` | no |
| 10 | `0010_rate_limits.sql` | no |

This means the deployed Worker was built from a branch or local change set that is not
on `master`. The repo cannot safely add a new `0006_*.sql` or later migration without
colliding with production's names.

## Production schema beyond the repo

- `game_states` has `version`, `revision`, and `is_anonymous` columns.
- `active_battles` has the unique index on `anonymous_id`.
- `dungeon_runs` has `ended_at`.
- `users` still exists.
- `wallet_bindings(sub, wallet_address, verified_at, created_at)` exists.
- `wallet_challenges(sub, nonce, message, wallet_address, created_at)` exists.
- `rate_limits(key, window_start, count, updated_at)` exists and contains rows.
- `d1_migrations` has ten rows.
- `battle_log`, `minting_queue`, and `keepers` are gone.

The snapshot contains real player saves and rate-limit keys (IP addresses). Do not commit
it, paste it into an issue, or send it to a third party.

## What this blocks

1. **Phase 1 auth and rate limiting** overlap with tables that already exist in
   production but have no repo source. We cannot tell whether the deployed Worker already
   enforces these.
2. **New migrations** must use names that sort after `0010` (or a timestamped scheme) and
   must be tested against the production snapshot, not just a fresh local database.
3. **Rollbacks** are unsafe until we know which Worker version is deployed.

## Required next steps (user-assisted)

1. Identify the deployed Worker version and the branch/commit it came from.
   ```bash
   cd backend
   npx wrangler deployments list
   npx wrangler deployments view <deployment-id>
   ```
2. Recover the missing migration and Worker source from that branch or local checkout.
   Do not re-create wallet/rate-limit tables from guesswork.
3. Decide the canonical history:
   - Prefer recovering the exact missing migration files and committing them, or
   - Freeze production as-is and add a new timestamped reconciliation migration.
4. Add a CI test that applies:
   - all repo migrations to a fresh local D1, and
   - the production snapshot plus the new migration.
5. Keep staging on the reconciled history before deploying any auth or rate-limit work.

## Local development

Local development uses the repo migrations. That is fine for code-level tests, but it is
not a faithful copy of production. Until the histories are reconciled, do not assume a
local migration test proves a production deploy is safe.
