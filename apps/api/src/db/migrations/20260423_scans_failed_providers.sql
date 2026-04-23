ALTER TABLE scans
ADD COLUMN IF NOT EXISTS failed_providers JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE scans
SET failed_providers = '[]'::jsonb
WHERE failed_providers IS NULL;
