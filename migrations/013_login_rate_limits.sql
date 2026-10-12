CREATE TABLE IF NOT EXISTS login_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_rate_limits_updated_at_idx
  ON login_rate_limits (updated_at);
