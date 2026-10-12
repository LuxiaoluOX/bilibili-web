ALTER TABLE weapon_build_versions
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz;

ALTER TABLE weapon_builds
  ADD COLUMN IF NOT EXISTS latest_source_published_at timestamptz;

WITH version_publications AS (
  SELECT vs.version_id, max(sc.published_at) AS published_at
  FROM version_sources vs
  JOIN source_contents sc ON sc.id = vs.source_content_id
  GROUP BY vs.version_id
)
UPDATE weapon_build_versions wbv
SET source_published_at = vp.published_at
FROM version_publications vp
WHERE wbv.id = vp.version_id
  AND wbv.source_published_at IS DISTINCT FROM vp.published_at;

WITH ranked AS (
  SELECT wbv.build_id, wbv.version, wbv.source_published_at,
         row_number() OVER (
           PARTITION BY wbv.build_id
           ORDER BY wbv.source_published_at DESC NULLS LAST, wbv.version DESC
         ) AS position
  FROM weapon_build_versions wbv
)
UPDATE weapon_builds wb
SET current_version = ranked.version,
    latest_source_published_at = ranked.source_published_at
FROM ranked
WHERE ranked.build_id = wb.id AND ranked.position = 1
  AND (wb.current_version IS DISTINCT FROM ranked.version
       OR wb.latest_source_published_at IS DISTINCT FROM ranked.source_published_at);
