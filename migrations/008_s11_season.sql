INSERT INTO game_seasons (code, name, starts_at)
VALUES ('S11', '群星', '2026-09-04 00:00:00+08')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    starts_at = EXCLUDED.starts_at,
    updated_at = now();
