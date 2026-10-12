CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bilibili_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'default',
  encrypted_cookie text NOT NULL,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'valid', 'invalid')),
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bilibili_mid bigint NOT NULL UNIQUE,
  name text NOT NULL,
  avatar_url text,
  enabled boolean NOT NULL DEFAULT true,
  schedule_mode text NOT NULL DEFAULT 'inherit' CHECK (schedule_mode IN ('inherit', 'override')),
  cron_expression text,
  next_run_at timestamptz,
  last_crawled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(id),
  bvid text NOT NULL UNIQUE,
  aid bigint,
  title text NOT NULL,
  cover_url text,
  description text NOT NULL DEFAULT '',
  published_at timestamptz,
  source_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id),
  source_type text NOT NULL CHECK (source_type IN ('video_description', 'root_comment')),
  external_id text NOT NULL,
  author_name text,
  raw_text text NOT NULL,
  content_hash text NOT NULL,
  source_url text NOT NULL,
  published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, external_id)
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(id),
  trigger text NOT NULL CHECK (trigger IN ('schedule', 'manual', 'backfill')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled')),
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  videos_scanned integer NOT NULL DEFAULT 0,
  candidates_found integer NOT NULL DEFAULT 0,
  error_message text,
  requested_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crawl_runs_queue_idx ON crawl_runs(status, available_at, created_at);

CREATE TABLE IF NOT EXISTS extraction_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_content_id uuid NOT NULL REFERENCES source_contents(id),
  creator_id uuid NOT NULL REFERENCES creators(id),
  raw_code text NOT NULL,
  normalized_code text NOT NULL,
  weapon_name text,
  normalized_weapon text,
  build_name text,
  normalized_build_name text,
  confidence numeric(4,3) NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted', 'pending', 'rejected', 'ignored')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_content_id, normalized_code)
);

CREATE TABLE IF NOT EXISTS weapon_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(id),
  weapon_name text NOT NULL,
  normalized_weapon text NOT NULL,
  build_name text NOT NULL,
  normalized_build_name text NOT NULL,
  current_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, normalized_weapon, normalized_build_name)
);

CREATE TABLE IF NOT EXISTS weapon_build_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid NOT NULL REFERENCES weapon_builds(id),
  version integer NOT NULL,
  code text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_from_candidate_id uuid REFERENCES extraction_candidates(id),
  UNIQUE (build_id, version),
  UNIQUE (build_id, code)
);

CREATE TABLE IF NOT EXISTS version_sources (
  version_id uuid NOT NULL REFERENCES weapon_build_versions(id) ON DELETE CASCADE,
  source_content_id uuid NOT NULL REFERENCES source_contents(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, source_content_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value)
VALUES ('global_schedule', '{"cronExpression":"0 */2 * * *","timezone":"Asia/Shanghai"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
