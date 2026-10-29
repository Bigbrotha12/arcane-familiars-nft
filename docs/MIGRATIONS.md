# Production D1 Migration Audit

Date: 2026-10-29
Snapshot: `docs/d1-snapshot-2026-10-29.sql` (local only; contains player and IP data, do not commit)
Production database: `arcane-familiars` (per `backend/wrangler.jsonc`)

## Status: reconciled by the upstream merge

The production snapshot listed ten migrations. The repository initially had only six,
with duplicate `0003` files and no `0007`–`0010`. Merging `origin/master` on 2026-10-29
brought the missing migration files and renumbered the older ones:

| # | Migration | Present |
|---|-----------|---------|
| 1 | `0001_initial.sql` | yes |
| 2 | `0002_add_game_state.sql` | yes |
| 3 | `0003_add_state_version.sql` | yes |
| 4 | `0004_state_revision.sql` | yes |
| 5 | `0005_dungeon_run_lifecycle.sql` | yes |
| 6 | `0006_drop_unused_tables.sql` | yes |
| 7 | `0007_add_wallet_bindings.sql` | yes |
| 8 | `0008_wallet_challenges.sql` | yes |
| 9 | `0009_add_guest_marker.sql` | yes |
| 10 | `0010_rate_limits.sql` | yes |

The production schema still has `game_states.version`, `revision`, and `is_anonymous`,
plus `active_battles`, `dungeon_runs`, `wallet_bindings`, `wallet_challenges`, `users`,
and `rate_limits`. The repository now matches that history.

## Remaining rules

- Do not rename or renumber applied migrations. New migrations must sort after `0010`
  (or use a timestamped scheme).
- Test new migrations against both a fresh local D1 and the production snapshot.
- Keep the snapshot local. It contains real player saves and rate-limit keys (IP
  addresses); do not commit it, paste it into an issue, or send it to a third party.
- The upstream merge deletes per-workspace lockfiles in favor of the root workspace lock.
  CI should install from the repo root; the old backend/frontend/game `npm ci` jobs are
  obsolete.
- Before deploying, confirm the Worker version and D1 binding:
  ```bash
  cd backend
  npx wrangler deployments list
  npx wrangler deployments view <deployment-id>
  ```

## Local development

Local development uses the repo migrations. `npm run db:setup` recreates the local D1
from them. This now mirrors production's migration names, though production may contain
data rows the local database does not.
