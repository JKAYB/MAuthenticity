ALTER TABLE scans ADD COLUMN IF NOT EXISTS scan_group_id UUID;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS retry_of_scan_id UUID;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE scans SET scan_group_id = id WHERE scan_group_id IS NULL;
UPDATE scans SET attempt_number = 1 WHERE attempt_number IS NULL OR attempt_number < 1;
UPDATE scans SET last_error = error_message WHERE last_error IS NULL AND error_message IS NOT NULL;

CREATE INDEX IF NOT EXISTS scans_group_created_idx
ON scans (scan_group_id, created_at DESC);
