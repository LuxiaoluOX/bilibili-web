ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$
DECLARE
  account record;
  base_name text;
  candidate text;
  suffix integer;
BEGIN
  FOR account IN
    SELECT id, email, role
    FROM users
    WHERE username IS NULL
    ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at
  LOOP
    base_name := lower(regexp_replace(split_part(coalesce(account.email, ''), '@', 1), '[^a-z0-9_-]+', '', 'g'));
    IF length(base_name) < 3 THEN
      base_name := 'user_' || substring(account.id::text, 1, 8);
    END IF;
    base_name := left(base_name, 28);
    candidate := base_name;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(candidate)) LOOP
      suffix := suffix + 1;
      candidate := left(base_name, 28) || '_' || suffix;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = account.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_format_check;
ALTER TABLE users
  ADD CONSTRAINT users_username_format_check
  CHECK (username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$');
