ALTER TABLE source_contents ALTER COLUMN game_mode SET DEFAULT 'operations';
ALTER TABLE extraction_candidates ALTER COLUMN game_mode SET DEFAULT 'operations';
ALTER TABLE weapon_builds ALTER COLUMN game_mode SET DEFAULT 'operations';
ALTER TABLE weapon_build_versions ALTER COLUMN game_mode SET DEFAULT 'operations';

-- The historical creator catalogue predates mode tagging and is confirmed to
-- contain Operations (烽火地带) codes. Explicit Warfare and Detonation rows
-- were already identified by migration 010 and remain unchanged.
UPDATE source_contents
SET game_mode = 'operations'
WHERE game_mode = 'unknown';

UPDATE extraction_candidates ec
SET game_mode = sc.game_mode
FROM source_contents sc
WHERE sc.id = ec.source_content_id
  AND ec.game_mode IS DISTINCT FROM sc.game_mode;
