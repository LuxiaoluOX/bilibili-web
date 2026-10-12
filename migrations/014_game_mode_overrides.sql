ALTER TABLE source_contents
  ADD COLUMN IF NOT EXISTS game_mode_override boolean NOT NULL DEFAULT false;

ALTER TABLE extraction_candidates
  ADD COLUMN IF NOT EXISTS game_mode_override boolean NOT NULL DEFAULT false;
