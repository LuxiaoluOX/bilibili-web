-- Reconcile source-level mode after manual build governance. A source becomes
-- authoritative only when all active candidates agree on one non-unknown mode.
WITH source_modes AS (
  SELECT ec.source_content_id,
         count(DISTINCT ec.game_mode) AS mode_count,
         max(ec.game_mode) AS agreed_mode
  FROM extraction_candidates ec
  WHERE ec.status IN ('accepted', 'pending')
  GROUP BY ec.source_content_id
)
UPDATE source_contents sc
SET game_mode = CASE
  WHEN sm.mode_count = 1 AND sm.agreed_mode <> 'unknown' THEN sm.agreed_mode
  ELSE 'unknown'
END
FROM source_modes sm
WHERE sc.id = sm.source_content_id
  AND sc.game_mode IS DISTINCT FROM CASE
    WHEN sm.mode_count = 1 AND sm.agreed_mode <> 'unknown' THEN sm.agreed_mode
    ELSE 'unknown'
  END;

-- Keep the downstream projection idempotent even when the full migration set
-- is replayed by the local migration runner.
WITH version_modes AS (
  SELECT wbv.id,
         CASE
           WHEN count(sc.id) > 0 AND count(DISTINCT sc.game_mode) = 1
             THEN max(sc.game_mode)
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
           WHEN count(wbv.id) > 0 AND count(DISTINCT wbv.game_mode) = 1
             THEN max(wbv.game_mode)
           ELSE 'unknown'
         END AS game_mode
  FROM weapon_builds wb
  LEFT JOIN weapon_build_versions wbv ON wbv.build_id = wb.id
  GROUP BY wb.id
)
UPDATE weapon_builds wb
SET game_mode = bm.game_mode,
    updated_at = now()
FROM build_modes bm
WHERE bm.id = wb.id
  AND wb.game_mode IS DISTINCT FROM bm.game_mode;
