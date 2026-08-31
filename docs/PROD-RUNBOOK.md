# Production Runbook — Arcane Familiars

> Ops runbook for the game app (frontend React SPA + Cloudflare Worker + D1). Required by [PRODUCTION-DEPLOYMENT-GAP-PLAN.md](./PRODUCTION-DEPLOYMENT-GAP-PLAN.md) item R10 (WS1 step 7) so the WS1/WS5 acceptances are satisfiable in P0. Use when: deploying staging/prod, rolling back a bad deploy, restoring from backup, or creating the alert rule.
> Companion gate: [DEFINITION_OF_PRODUCTION.md](./DEFINITION_OF_PRODUCTION.md) — the prod deploy job does not run until that file exists; the push to `master` is the approval.

## Pre-deploy checklist (from plan §6)

Run once per environment before enabling deploy jobs. All authenticated steps are user-run per AGENTS.md.

- [ ] `wrangler login` / confirm the production Cloudflare account.
- [ ] Confirm prod D1 `arcane-familiars` exists and `backend/wrangler.jsonc` has the real id (`8e8bce41-…`).
- [ ] GitHub Actions secrets:
  - `CLOUDFLARE_API_TOKEN` — **Workers + Pages + D1 write + R2 write** scopes (L5).
  - `CLOUDFLARE_API_EMAIL`.
  - `CLOUDFLARE_ACCOUNT_ID`.
- [ ] GitHub Actions repo variables:
  - `CF_WORKERS_SUBDOMAIN` — **required**; the account's workers.dev subdomain (e.g. `acct` from `https://acct.workers.dev`), used to build the `VITE_BACKEND_URL`.
  - `BACKUP_R2_BUCKET` — optional; if set, the pre-migration D1 dump is also uploaded to R2.
- [ ] Worker secrets via `wrangler secret put --env production` (e.g. `JWT_SECRET` when WS2 lands).
- [ ] GitHub `production` environment exists (created automatically on first use) — it scopes the prod job's secrets/vars; **no protection rules required** (solo dev: the push to `master` is the approval).
- [ ] Staging D1 `arcane-familiars-staging` created via `wrangler d1 create arcane-familiars-staging`; fill the returned `database_id` into the `backend/wrangler.jsonc` staging placeholder (`00000000-…`, line 59).
- [ ] Pages projects `arcane-familiars` + `arcane-familiars-staging` — **auto-created** by the deploy workflow (`.github/actions/ensure-pages-project`) on first deploy; nothing to pre-create.
- [ ] Optional `BACKUP_R2_BUCKET` + R2 bucket with lifecycle rules (14 daily + 12 monthly) for durable backups.
- [ ] Record URLs (plan §6):
  - Prod Worker URL (API base for `VITE_BACKEND_URL`): `arcane-familiars-backend-production.<subdomain>.workers.dev`
  - Staging Worker URL (API base for staging `VITE_BACKEND_URL`): `arcane-familiars-backend-staging.<subdomain>.workers.dev`
  - Prod Pages URL: `arcane-familiars.pages.dev`
  - Staging Pages URL: `arcane-familiars-staging.pages.dev`
  - CORS allowlist = **Pages URLs only** (`PROD_ORIGINS` in `backend/src/index.ts`). Worker URLs are the API base, **never** allowlist entries (M3).

## Deploy procedure

### Staging (runs on push to `master`, before prod)

1. `npm run db:migrate:staging` — applies migrations to `arcane-familiars-staging` **before** deploy (R8).
2. From `backend/`: `npx wrangler deploy --env staging`.
3. Build the frontend with the staging Worker URL: `VITE_BACKEND_URL=https://<staging-worker-url> npm run frontend:build`.
4. From `frontend/`: `npx wrangler pages deploy dist --project-name=arcane-familiars-staging --branch=production` (direct upload).
5. Verify the staging SPA against the staging backend and that deep links resolve.

### Production (gated; runs on `master` merge)

Gated on the push to `master` (the approval, solo dev — no reviewers/wait timer); a step-level `hashFiles` gate fails the prod job if `docs/DEFINITION_OF_PRODUCTION.md` is missing.

1. **Back up before mutating:** from `backend/`, `npx wrangler d1 export arcane-familiars --env production --remote --output d1-export.sql --skip-confirmation` → attach as a GH Actions artifact (`d1-backup-*`) **and/or** upload to R2 (`d1-backup/<date>.sql`). Without `--output`, the dump goes to stdout, which can't be attached as an artifact. Durable destination, not just the ephemeral runner (R6).
2. `npm run db:migrate:remote` — applies migrations to `arcane-familiars` (prod).
3. From `backend/`: `npx wrangler deploy --env production`.
4. Build the frontend with the prod Worker URL: `VITE_BACKEND_URL=https://<prod-worker-url> npm run frontend:build`.
5. `npx wrangler pages deploy frontend/dist --project-name=arcane-familiars --branch=production`.
6. Verify `GET /api/health` on the prod Worker and deep links on the prod SPA.

## Rollback procedure (R10)

The D1 export is a **full-dump SQL**. Restore = **create a new D1 database and apply the SQL**; D1 has no destructive overwrite.

1. **Identify the last good export** — newest GH Actions artifact `d1-backup-*` or R2 `d1-backup/*.sql` predating the bad deploy.
2. **Create a fresh database:** `wrangler d1 create arcane-familiars-restored`, capture the new `database_id`.
3. **Re-point the `DB` binding:** set the restored `database_id` in the `backend/wrangler.jsonc` production env (or an env override) — **before** applying the export.
4. **Apply the export to the restored DB:** `npx wrangler d1 execute arcane-familiars-restored --remote --file ./d1-backup/<last-good>.sql`.
5. **Redeploy:** from `backend/`, `npx wrangler deploy --env production`.
6. **Verify:** `GET /api/health` returns healthy and a sample game read succeeds.
7. Rebuild + redeploy the frontend only if the frontend bundle is what needs rollback (`wrangler pages deploy` a prior build artifact).

## Data handling

The `d1-backup-*` GitHub artifacts (and R2 `d1-backup/` objects) contain **full player game-state dumps**. Confirm the R2 bucket/objects stay **private**, and treat artifacts as sensitive: repo read access implies access to backups.

## Alert rule (manual, per L7/R13 — WS5 step 20)

Cloudflare dashboard alerts are manual, not code. Create the rule once, in the dashboard:

1. Cloudflare dashboard → **Workers & Pages** → **arcane-familiars-backend-production**.
2. **Monitoring** → **Alerts**.
3. **Create alert** on **HTTP 5xx rate** and/or **Workers exception rate** for the Worker.
4. Set the threshold so "alerts within minutes" is true (e.g. ≥ 1 5xx / exception in a 1-minute window).
5. Configure the **notification channel** (email/webhook) and save.
6. Record the rule in the incident SLA: time-to-alert ≤ 15 min ([DEFINITION_OF_PRODUCTION.md](./DEFINITION_OF_PRODUCTION.md)).

## Anti-farming deferred re-review (WS4 step 18, R18)

> Placeholder — if the anti-farming cap (daily battle/currency cap or energy system) is **deferred**, record the owner + dated re-review item here:

- **Decision:** (to be filled on deferral)
- **Owner:** (to be filled)
- **Re-review date:** (to be filled)
- **Accepted risk:** unbounded currency farming is explicitly accepted until the re-review date.