ALTER TABLE users
ALTER COLUMN email TYPE text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create users_email_lower_unique: duplicate emails exist when compared case-insensitively';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
ON users (lower(email));
