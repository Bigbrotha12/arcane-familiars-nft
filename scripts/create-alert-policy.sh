#!/usr/bin/env bash
#
# create-alert-policy.sh
#
# PURPOSE
#   Provisions Cloudflare account-level Notification policies for the Arcane
#   Familiars production app (WS5 step 20 "Alert rule", see docs/PROD-RUNBOOK.md).
#
# WHY THIS EXISTS
#   Cloudflare removed the per-Worker dashboard alert page and all workers_*
#   alert types. Alert policies are now account-level Notification policies
#   created via the Notifications API:
#       POST /accounts/{account_id}/alerting/v3/policies
#   See docs/PROD-RUNBOOK.md (WS5 step 20) for context.
#
# WHAT IT PROVISIONS (in order, each idempotent — skipped if a policy with the
#   same `name` already exists):
#   1. arcane-familiars-synthetic-availability  -> synthetic_test_low_availability_alert
#   2. arcane-familiars-synthetic-latency       -> synthetic_test_latency_alert
#   3. arcane-familiars-5xx                     -> advanced_http_alert_error
#
# REQUIRED ENV
#   CLOUDFLARE_API_TOKEN   API token with "Notifications:Edit" permission scope.
#   CLOUDFLARE_ACCOUNT_ID  Cloudflare account id.
#   NOTIFICATION_EMAIL     Email address to receive the alerts (the email
#                          mechanism's id is the email address itself).
#
# OPTIONAL ENV
#   CF_ZONE_ID             Zone id used as the zone filter for the 5xx alert
#                          (advanced_http_alert_error requires a zone filter).
#                          If unset, the 5xx policy is skipped with a warning.
#                          Note: the frontend is on Pages (arcane-familiars
#                          .pages.dev) and the backend on Workers
#                          (*.workers.dev) — these have no zone_id, so this
#                          alert only covers zone-proxied traffic.
#   CF_SYNTHETIC_TEST_ID   Id of an existing Synthetic Monitoring test. If
#                          unset, the two synthetic policies are skipped with
#                          a warning. See "Creating the synthetic test" below.
#
# IDEMPOTENT
#   Lists existing policies (GET /accounts/{account_id}/alerting/v3/policies),
#   skips creation when a policy with the same name already exists, otherwise
#   POSTs to create it. Safe to run more than once.
#
# RUN ONCE (authenticated — the agent must not run this):
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
#   NOTIFICATION_EMAIL=... [CF_ZONE_ID=...] [CF_SYNTHETIC_TEST_ID=...] \
#   ./scripts/create-alert-policy.sh
#
# CREATING THE SYNTHETIC TEST (dashboard)
#   The synthetic alert types reference an existing Synthetic Monitoring test
#   by its test id. Create the test in the dashboard:
#       Zone -> Speed -> Synthetic monitoring -> create a test
#   URL: the prod health endpoint, e.g.
#       https://arcane-familiars-backend-production.<subdomain>.workers.dev/api/health
#   then copy the test id into CF_SYNTHETIC_TEST_ID.
#   A zone-scoped Speed API exists
#   (POST /zones/{zone_id}/speed_api/schedule/{url},
#    https://developers.cloudflare.com/api/resources/speed/subresources/schedule/)
#   but it is documented as "page tests" (Observatory/Lighthouse) and Cloudflare
#   does not document a stable mapping from those ids to the alert filter, so
#   prefer creating the test in the dashboard and passing its id.
#
set -euo pipefail

POLICY_PATH="/alerting/v3/policies"
BASE_URL="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}"

created_count=0
existing_count=0
skipped_count=0
failed_count=0

# cf_api METHOD PATH [JSON_BODY]
#   Calls the account-scoped Notifications API with the Bearer token and prints
#   the raw JSON response body. The caller inspects the `success` field.
cf_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  local args=(-sS --max-time 60 -X "$method")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi

  curl "${args[@]}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "${BASE_URL}${path}"
}

# json_safe VALUE  NAME
#   Guards against values that would break the JSON payload we build.
json_safe() {
  local value="$1"
  local name="$2"
  if [[ "$value" =~ [\"\\[:space:]] ]]; then
    echo "ERROR: ${name} contains characters unsafe for JSON: ${value}" >&2
    exit 1
  fi
}

# policy_exists NAME
#   Returns 0 (true) if a policy with the given name already exists, 1 otherwise.
#   Fails hard if the list call itself errors (bad token/scope, etc.).
policy_exists() {
  local name="$1"
  local list
  list="$(cf_api GET "${POLICY_PATH}")"

  if ! printf '%s' "$list" | grep -q '"success":true'; then
    echo "ERROR: could not list existing policies (check token / Notifications:Edit scope):" >&2
    printf '%s\n' "$list" >&2
    exit 1
  fi

  printf '%s' "$list" | grep -qF "\"name\":\"${name}\""
}

# create_policy NAME ALERT_TYPE DESCRIPTION JSON_FILTERS
#   Idempotent create. Prints status and updates the summary counters.
create_policy() {
  local name="$1"
  local alert_type="$2"
  local description="$3"
  local filters="$4"

  if policy_exists "$name"; then
    echo "  [already present] ${name}"
    existing_count=$((existing_count + 1))
    return
  fi

  local body
  body="$(printf '{"alert_type":"%s","name":"%s","enabled":true,"description":"%s","mechanisms":{"email":[{"id":"%s"}]},"filters":%s}' \
    "$alert_type" "$name" "$description" "$NOTIFICATION_EMAIL" "$filters")"

  echo "  [creating] ${name} (${alert_type})"
  local resp
  resp="$(cf_api POST "${POLICY_PATH}" "$body")"

  if printf '%s' "$resp" | grep -q '"success":true'; then
    echo "  [created] ${name}"
    created_count=$((created_count + 1))
  else
    echo "  [FAILED] ${name}" >&2
    printf '%s\n' "$resp" >&2
    failed_count=$((failed_count + 1))
  fi
}

main() {
  echo "== Validating environment =="

  : "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (Notifications:Edit scope)}"
  : "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
  : "${NOTIFICATION_EMAIL:?Set NOTIFICATION_EMAIL (email delivery mechanism is required)}"

  json_safe "$CLOUDFLARE_API_TOKEN" CLOUDFLARE_API_TOKEN
  json_safe "$CLOUDFLARE_ACCOUNT_ID" CLOUDFLARE_ACCOUNT_ID
  json_safe "$NOTIFICATION_EMAIL" NOTIFICATION_EMAIL

  local synthetic_gated="no"
  local zone_gated="no"

  echo "== Synthetic availability alert (synthetic_test_low_availability_alert) =="
  if [[ -n "${CF_SYNTHETIC_TEST_ID:-}" ]]; then
    json_safe "$CF_SYNTHETIC_TEST_ID" CF_SYNTHETIC_TEST_ID
    # Filter key `test_id` selects the Synthetic Monitoring test. It is not
    # enumerated in the PolicyFilter schema doc (which is a non-exhaustive
    # union; "test_id" appears in dashboard-generated policies). Confirm the
    # exact key/value against GET /alerting/v3/available_alerts once the test
    # exists if creation is rejected.
    create_policy "arcane-familiars-synthetic-availability" \
      "synthetic_test_low_availability_alert" \
      "Arcane Familiars prod /api/health probe missed its availability target (SLA time-to-alert <= 15 min)." \
      "{\"test_id\":[\"${CF_SYNTHETIC_TEST_ID}\"]}"
  else
    echo "  [skip] CF_SYNTHETIC_TEST_ID not set — synthetic alerts need an existing Synthetic Monitoring test"
    skipped_count=$((skipped_count + 1))
    synthetic_gated="yes"
  fi

  echo "== Synthetic latency alert (synthetic_test_latency_alert) =="
  if [[ "${synthetic_gated}" == "no" ]]; then
    # NOTE: dropped `"slo"` filter. The docs confirm `slo` as a PolicyFilter
    # key, but for the documented example types its values are SLO percentages
    # (e.g. "99.9"), and it could not be verified for synthetic_test_latency_
    # alert nor that "500" (ms) is valid. Tune the latency threshold in the
    # dashboard (Zone -> Speed -> Synthetic monitoring) / available_alerts once
    # the test exists; default policy fires on the test's configured latency SLO.
    create_policy "arcane-familiars-synthetic-latency" \
      "synthetic_test_latency_alert" \
      "Arcane Familiars prod /api/health probe exceeded its latency target (DoP p95 < 500 ms at 20 concurrent players)." \
      "{\"test_id\":[\"${CF_SYNTHETIC_TEST_ID}\"]}"
  else
    echo "  [skip] CF_SYNTHETIC_TEST_ID not set — see above"
    skipped_count=$((skipped_count + 1))
  fi

  echo "== Edge 5xx alert (advanced_http_alert_error) =="
  if [[ -n "${CF_ZONE_ID:-}" ]]; then
    json_safe "$CF_ZONE_ID" CF_ZONE_ID
    # advanced_http_alert_error requires a zone-scoped filter.
    create_policy "arcane-familiars-5xx" \
      "advanced_http_alert_error" \
      "Arcane Familiars high edge 5xx error rate on the site zone." \
      "{\"zones\":[\"${CF_ZONE_ID}\"]}"
  else
    echo "  [skip] CF_ZONE_ID not set — advanced_http_alert_error requires a zone filter and Pages/Workers have no zone"
    skipped_count=$((skipped_count + 1))
    zone_gated="yes"
  fi

  echo
  echo "== Summary =="
  echo "  created:          ${created_count}"
  echo "  already present:  ${existing_count}"
  echo "  skipped:          ${skipped_count}"
  if [[ "${synthetic_gated}" == "yes" ]]; then
    echo "  NOTE: synthetic policies skipped — create a Synthetic Monitoring test (Zone -> Speed -> Synthetic monitoring)"
    echo "        and re-run with CF_SYNTHETIC_TEST_ID set."
  fi
  if [[ "${zone_gated}" == "yes" ]]; then
    echo "  NOTE: 5xx policy skipped — set CF_ZONE_ID if a zone-scoped edge 5xx alert is wanted."
  fi
  if [[ "${failed_count}" -gt 0 ]]; then
    echo "  FAILED:           ${failed_count}"
    exit 1
  fi
}

main "$@"
