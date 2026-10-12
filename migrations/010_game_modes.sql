ALTER TABLE source_contents ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'unknown';
ALTER TABLE extraction_candidates ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'unknown';
ALTER TABLE weapon_builds ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'unknown';
ALTER TABLE weapon_build_versions ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'unknown';

DO $$ BEGIN
  ALTER TABLE source_contents ADD CONSTRAINT source_contents_game_mode_check
    CHECK (game_mode IN ('unknown', 'operations', 'warfare', 'black_tide'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE extraction_candidates ADD CONSTRAINT extraction_candidates_game_mode_check
    CHECK (game_mode IN ('unknown', 'operations', 'warfare', 'black_tide'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE weapon_builds ADD CONSTRAINT weapon_builds_game_mode_check
    CHECK (game_mode IN ('unknown', 'operations', 'warfare', 'black_tide'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE weapon_build_versions ADD CONSTRAINT weapon_build_versions_game_mode_check
    CHECK (game_mode IN ('unknown', 'operations', 'warfare', 'black_tide'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE source_contents sc
SET game_mode = CASE
  WHEN concat_ws(E'\n', v.title, sc.raw_text) ~ '黑潮(爆破|模式)?' THEN 'black_tide'
  WHEN concat_ws(E'\n', v.title, sc.raw_text) ~ '(全面战场|大战场)' THEN 'warfare'
  WHEN concat_ws(E'\n', v.title, sc.raw_text) ~ '(烽火地带|烽火模式)' THEN 'operations'
  ELSE 'unknown'
END
FROM videos v
WHERE v.id = sc.video_id;

UPDATE extraction_candidates ec
SET game_mode = sc.game_mode
FROM source_contents sc
WHERE sc.id = ec.source_content_id
  AND ec.game_mode IS DISTINCT FROM sc.game_mode;

WITH version_modes AS (
  SELECT wbv.id,
    CASE
      WHEN count(DISTINCT sc.game_mode) FILTER (WHERE sc.game_mode <> 'unknown') = 1
        THEN max(sc.game_mode) FILTER (WHERE sc.game_mode <> 'unknown')
      ELSE 'unknown'
    END AS game_mode
  FROM weapon_build_versions wbv
  LEFT JOIN version_sources vs ON vs.version_id = wbv.id
  LEFT JOIN source_contents sc ON sc.id = vs.source_content_id
  GROUP BY wbv.id
)
UPDATE weapon_build_versions wbv
SET game_mode = vm.game_mode
FROM version_modes vm
WHERE vm.id = wbv.id
  AND wbv.game_mode IS DISTINCT FROM vm.game_mode;

WITH build_modes AS (
  SELECT wb.id,
    CASE
      WHEN count(DISTINCT wbv.game_mode) FILTER (WHERE wbv.game_mode <> 'unknown') = 1
        THEN max(wbv.game_mode) FILTER (WHERE wbv.game_mode <> 'unknown')
      ELSE 'unknown'
    END AS game_mode
  FROM weapon_builds wb
  LEFT JOIN weapon_build_versions wbv ON wbv.build_id = wb.id
  GROUP BY wb.id
)
UPDATE weapon_builds wb
SET game_mode = bm.game_mode
FROM build_modes bm
WHERE bm.id = wb.id
  AND wb.game_mode IS DISTINCT FROM bm.game_mode;

ALTER TABLE weapon_builds
  DROP CONSTRAINT IF EXISTS weapon_builds_creator_id_normalized_weapon_normalized_build_name_key;
ALTER TABLE weapon_builds
  DROP CONSTRAINT IF EXISTS weapon_builds_creator_id_normalized_weapon_normalized_build_key;

-- A unique index provides the same conflict target for INSERT ... ON CONFLICT
-- while remaining safely repeatable if an older deployment already created the
-- backing relation without a pg_constraint entry.
CREATE UNIQUE INDEX IF NOT EXISTS weapon_builds_creator_mode_weapon_build_key
  ON weapon_builds (creator_id, game_mode, normalized_weapon, normalized_build_name);

CREATE INDEX IF NOT EXISTS source_contents_game_mode_idx ON source_contents(game_mode);
CREATE INDEX IF NOT EXISTS extraction_candidates_game_mode_idx ON extraction_candidates(game_mode, status);
CREATE INDEX IF NOT EXISTS weapon_builds_game_mode_idx ON weapon_builds(game_mode, normalized_weapon);
