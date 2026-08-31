# Definition of Production

> Gate document for production deployment. Per [PRODUCTION-DEPLOYMENT-GAP-PLAN.md](./PRODUCTION-DEPLOYMENT-GAP-PLAN.md) §5 (M2), the prod deploy job in `.github/workflows/deploy.yml` runs on a push to `master` (the approval) and its first step fails if this file is missing (step-level `hashFiles` gate — `hashFiles` is not valid in job-level `if`).

## Owner & review

- **Owner:** Bigbrotha12 (repo owner).
- **Review date:** 2026-08-30.
- All numbers below are **launch targets**, owner-confirmed as of the review date. The CI gate checks only that this file is present in the repository; the values are owner-maintained and should be re-reviewed before each production deploy.

## Users

- **Launch target:** 20 concurrent players at launch (owner-confirmed).
- **90-day goal:** 500 DAU (owner-confirmed).

## Load

- **Expected battles/hour at peak:** 100 battles/hour.
- **Max D1 row growth/day:** 1,000 rows/day, measured via the WS5 probe (vs the scheduled cleanup cron).

## Cost ceiling

- **Monthly Cloudflare budget:** $50/month (Workers + D1 writes + R2).

## Availability

- **Uptime target:** 99.5%.
- `/api/health` is monitored; uptime is measured against that probe.

## Incident SLA

- **Time-to-alert:** ≤ 15 min. Alert rule created manually per [PROD-RUNBOOK.md](./PROD-RUNBOOK.md) (WS5 step 20).
- **Time-to-restore:** ≤ 30 min from a durable D1 export.

## Acceptance criteria

The WS1 acceptance (playable prod Worker + SPA on master merge, deep links work, staging precedes prod, rollback via durable backup) is gated on:

1. A merge to `master` produces a **playable** prod Worker + SPA — the game talks to the prod backend, not localhost.
2. Deep links (`/app/*`, `/play/*`, `/preview/*`) resolve via the SPA `_redirects` fallback.
3. The staging deploy precedes and validates the prod deploy.
4. Rollback is a documented restore from a durable backup (see [PROD-RUNBOOK.md](./PROD-RUNBOOK.md)).
5. **Number-bound criterion:** at **20 concurrent players** (launch target), the `/api/health` probe **p95 latency stays under 500 ms** (WS5 probe).
6. **Number-bound criterion:** a data incident is restored from a durable D1 export within **30 min** (incident SLA above).
7. **Number-bound criterion:** monthly Cloudflare spend stays under **$50/month** (cost ceiling).