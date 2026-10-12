ALTER TABLE bilibili_credentials
  ADD COLUMN IF NOT EXISTS login_method text NOT NULL DEFAULT 'manual';

ALTER TABLE bilibili_credentials
  ADD COLUMN IF NOT EXISTS account_name text;

ALTER TABLE bilibili_credentials
  ADD COLUMN IF NOT EXISTS account_mid bigint;

ALTER TABLE bilibili_credentials
  DROP CONSTRAINT IF EXISTS bilibili_credentials_login_method_check;

ALTER TABLE bilibili_credentials
  ADD CONSTRAINT bilibili_credentials_login_method_check
  CHECK (login_method IN ('manual', 'qr', 'password'));
