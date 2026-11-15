-- 0014_login_throttle.sql
-- Per-email failed-login counters (fixed window). Limits online password
-- guessing against one account independently of the per-IP rate limiter, so a
-- distributed attacker cannot spread guesses across many IPs.
CREATE TABLE IF NOT EXISTS login_failures (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_login_failures_window ON login_failures (window_start);
