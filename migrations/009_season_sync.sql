CREATE TABLE IF NOT EXISTS season_sync_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  source_url text NOT NULL,
  published_at timestamptz,
  content_hash text NOT NULL,
  raw_content text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS season_sync_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES season_sync_sources(id) ON DELETE CASCADE,
  season_code text NOT NULL,
  season_name text NOT NULL,
  starts_at timestamptz NOT NULL,
  detected_weapons jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected', 'failed')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  published_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, season_code)
);

CREATE INDEX IF NOT EXISTS season_sync_candidates_status_idx
  ON season_sync_candidates(status, created_at DESC);

CREATE TABLE IF NOT EXISTS season_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('check', 'publish')),
  trigger text NOT NULL CHECK (trigger IN ('manual', 'schedule')),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'no_changes', 'failed')),
  sources_checked integer NOT NULL DEFAULT 0,
  changes_found integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS season_sync_runs_started_idx
  ON season_sync_runs(started_at DESC);
