ALTER TABLE scans
ADD COLUMN IF NOT EXISTS provider_statuses JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE scans
SET provider_statuses = '{}'::jsonb
WHERE provider_statuses IS NULL;
