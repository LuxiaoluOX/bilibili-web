CREATE TABLE IF NOT EXISTS game_seasons (
  code text PRIMARY KEY,
  name text NOT NULL,
  starts_at timestamptz NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO game_seasons (code, name, starts_at)
VALUES
  ('S1', '起源', '2024-09-26 00:00:00+08'),
  ('S2', '聚变', '2024-11-21 00:00:00+08'),
  ('S3', '焰火', '2025-01-15 00:00:00+08'),
  ('S4', '黑夜之子', '2025-04-17 00:00:00+08'),
  ('S5', '破壁', '2025-07-03 00:00:00+08'),
  ('S6', '烈火冲天', '2025-09-17 00:00:00+08'),
  ('S7', '阿萨拉', '2025-11-13 00:00:00+08'),
  ('S8', '蝶变时刻', '2026-01-29 00:00:00+08'),
  ('S9', '回声', '2026-04-16 00:00:00+08'),
  ('S10', '裂变', '2026-06-26 00:00:00+08')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    starts_at = EXCLUDED.starts_at,
    updated_at = now();

-- This migration is the historical baseline through S10. Later season
-- boundaries are appended by subsequent migrations.
DELETE FROM game_seasons WHERE code = 'S11';
