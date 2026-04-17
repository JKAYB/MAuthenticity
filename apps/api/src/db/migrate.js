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
