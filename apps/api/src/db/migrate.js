const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env")
});

const { pool } = require("./pool");

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS organization TEXT`);
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_value TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scans (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      confidence NUMERIC(5, 2),
      is_ai_generated BOOLEAN,
      result_payload JSONB,
      error_message TEXT,
      is_retry BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
  `);

  // One ALTER per column — safer on existing DBs than a single multi-add statement.
  await pool.query(
    `ALTER TABLE scans ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT NOT NULL DEFAULT 0`
  );
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS result_payload JSONB`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS error_message TEXT`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS summary TEXT`);
  await pool.query(
    `ALTER TABLE scans ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'upload'`
  );
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS source_url TEXT`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS storage_key TEXT`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS detection_provider TEXT`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS scan_group_id UUID`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS retry_of_scan_id UUID`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS last_error TEXT`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS failed_providers JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS error_payload JSONB`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS is_retry BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS provider_statuses JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(
    `ALTER TABLE scans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  );

  await pool.query(`
    ALTER TABLE scans
    ALTER COLUMN status SET DEFAULT 'pending';
  `);

  await pool.query(`
    UPDATE scans
    SET status = 'pending'
    WHERE status = 'queued';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS scans_user_created_idx
    ON scans (user_id, created_at DESC);
  `);

  await pool.query(
    `ALTER TABLE scans ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`
  );
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS storage_provider TEXT`);
  await pool.query(
    `ALTER TABLE scans ADD COLUMN IF NOT EXISTS selected_providers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`
  );
  await pool.query(`UPDATE scans SET scan_group_id = id WHERE scan_group_id IS NULL`);
  await pool.query(`UPDATE scans SET attempt_number = 1 WHERE attempt_number IS NULL OR attempt_number < 1`);
  await pool.query(`UPDATE scans SET last_error = error_message WHERE last_error IS NULL AND error_message IS NOT NULL`);
  await pool.query(`UPDATE scans SET failed_providers = '[]'::jsonb WHERE failed_providers IS NULL`);
  await pool.query(`UPDATE scans SET is_retry = FALSE WHERE is_retry IS NULL`);
  await pool.query(`UPDATE scans SET provider_statuses = '{}'::jsonb WHERE provider_statuses IS NULL`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS scans_group_created_idx
     ON scans (scan_group_id, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_scans_group_attempt
     ON scans (scan_group_id, attempt_number DESC)`
  );

  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS old_storage_key TEXT`);
  await pool.query(
    `ALTER TABLE scans ADD COLUMN IF NOT EXISTS storage_migrated_at TIMESTAMPTZ`
  );

  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS scans_filename_trgm_idx
      ON scans USING gin (filename gin_trgm_ops);
    `);
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    console.warn(
      "[migrate] pg_trgm / scans_filename_trgm_idx skipped (extension or permissions):",
      msg
    );
  }
}
runMigrations()
  .then(() => {
    console.log("Migrations complete");
    return pool.end();
  })
  .catch(async (error) => {
    console.error("Migration failed", error);
    await pool.end();
    process.exit(1);
  });
