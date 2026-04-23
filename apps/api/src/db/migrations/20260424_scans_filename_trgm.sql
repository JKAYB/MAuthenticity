-- Speeds up case-insensitive filename search (GET /scan/history?q=...).
-- Requires pg_trgm. On managed Postgres, enable the extension in the provider UI if CREATE EXTENSION is not allowed for the app role.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS scans_filename_trgm_idx
  ON scans USING gin (filename gin_trgm_ops);
