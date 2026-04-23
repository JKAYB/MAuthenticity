CREATE INDEX IF NOT EXISTS idx_scans_group_attempt
ON scans (scan_group_id, attempt_number DESC);
