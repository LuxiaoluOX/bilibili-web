ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS last_full_sweep_at timestamptz;

ALTER TABLE source_contents
  ADD COLUMN IF NOT EXISTS ingestion_method text NOT NULL DEFAULT 'api';

ALTER TABLE source_contents
  DROP CONSTRAINT IF EXISTS source_contents_source_type_check;

ALTER TABLE source_contents
  ADD CONSTRAINT source_contents_source_type_check
  CHECK (source_type IN ('video_description', 'root_comment', 'manual_import'));

ALTER TABLE source_contents
  DROP CONSTRAINT IF EXISTS source_contents_ingestion_method_check;

ALTER TABLE source_contents
  ADD CONSTRAINT source_contents_ingestion_method_check
  CHECK (ingestion_method IN ('api', 'page', 'manual'));

UPDATE system_settings
SET value = jsonb_set(value, '{cronExpression}', '"17 */12 * * *"'::jsonb), updated_at = now()
WHERE key = 'global_schedule' AND value->>'cronExpression' = '0 */2 * * *';
