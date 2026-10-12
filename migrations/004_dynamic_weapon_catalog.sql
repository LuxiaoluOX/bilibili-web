CREATE TABLE IF NOT EXISTS weapons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  weapon_type text,
  introduced_season text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'provisional', 'retired')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weapon_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weapon_id uuid NOT NULL REFERENCES weapons(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weapon_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  occurrences integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'mapped', 'rejected')),
  first_source_content_id uuid REFERENCES source_contents(id) ON DELETE SET NULL,
  last_source_content_id uuid REFERENCES source_contents(id) ON DELETE SET NULL,
  resolved_weapon_id uuid REFERENCES weapons(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz
);

ALTER TABLE extraction_candidates ADD COLUMN IF NOT EXISTS weapon_id uuid REFERENCES weapons(id) ON DELETE SET NULL;
ALTER TABLE extraction_candidates ADD COLUMN IF NOT EXISTS suggested_weapon text;
ALTER TABLE extraction_candidates ADD COLUMN IF NOT EXISTS code_confidence numeric(4,3) NOT NULL DEFAULT 0;
ALTER TABLE extraction_candidates ADD COLUMN IF NOT EXISTS weapon_confidence numeric(4,3) NOT NULL DEFAULT 0;
ALTER TABLE extraction_candidates ADD COLUMN IF NOT EXISTS attribution_status text NOT NULL DEFAULT 'unresolved';

DO $$ BEGIN
  ALTER TABLE extraction_candidates ADD CONSTRAINT extraction_candidates_attribution_status_check
    CHECK (attribution_status IN ('resolved', 'provisional', 'unresolved'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE extraction_candidates
SET code_confidence = confidence,
    weapon_confidence = CASE WHEN weapon_name IS NOT NULL THEN 0.99 ELSE 0 END,
    attribution_status = CASE WHEN weapon_name IS NOT NULL THEN 'resolved' ELSE 'unresolved' END
WHERE code_confidence = 0;

INSERT INTO weapons (canonical_name, normalized_name)
VALUES ('K437','K437'), ('KC-17','KC-17'), ('M7','M7'), ('M700','M700'), ('PKM','PKM'),
       ('AS VAL','AS VAL'), ('AKM','AKM'), ('M4A1','M4A1')
ON CONFLICT (normalized_name) DO NOTHING;

INSERT INTO weapon_aliases (weapon_id, alias, normalized_alias)
SELECT id, canonical_name, normalized_name FROM weapons
ON CONFLICT (normalized_alias) DO NOTHING;

INSERT INTO weapon_aliases (weapon_id, alias, normalized_alias)
SELECT id, 'ASVAL', 'ASVAL' FROM weapons WHERE normalized_name = 'AS VAL'
ON CONFLICT (normalized_alias) DO NOTHING;

UPDATE extraction_candidates ec
SET weapon_id = w.id, weapon_name = w.canonical_name, normalized_weapon = w.normalized_name,
    weapon_confidence = 0.99, attribution_status = 'resolved'
FROM weapons w
WHERE ec.normalized_weapon = w.normalized_name AND ec.weapon_id IS NULL;

CREATE INDEX IF NOT EXISTS weapon_discoveries_status_idx ON weapon_discoveries(status, occurrences DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS extraction_candidates_suggested_weapon_idx ON extraction_candidates(suggested_weapon) WHERE attribution_status = 'unresolved';
