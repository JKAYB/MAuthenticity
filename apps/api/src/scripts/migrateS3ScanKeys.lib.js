"use strict";

const {
  isStructuredOriginalScanStorageKey,
  plannedStructuredS3StorageKey
} = require("@media-auth/scan-storage");

/**
 * @typedef {object} MigrateS3KeysCli
 * @property {boolean} help
 * @property {boolean} dryRun
 * @property {boolean} execute
 * @property {boolean} deleteOldObjects
 * @property {number | null} limit
 * @property {string | null} scanId
 */

/**
 * @param {string[]} argv
 * @returns {MigrateS3KeysCli}
 */
function parseMigrateS3KeysCli(argv) {
  /** @type {MigrateS3KeysCli} */
  const out = {
    help: false,
    dryRun: false,
    execute: false,
    deleteOldObjects: false,
    limit: null,
    scanId: null
  };
  const args = argv.slice();
  while (args.length) {
    const a = args.shift();
    if (!a) continue;
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--execute") {
      out.execute = true;
      continue;
    }
    if (a === "--delete-old-objects") {
      out.deleteOldObjects = true;
      continue;
    }
    if (a === "--limit") {
      const v = args.shift();
      const n = v != null ? parseInt(String(v), 10) : NaN;
      if (!Number.isInteger(n) || n < 1) {
        throw new Error("--limit requires a positive integer");
      }
      out.limit = n;
      continue;
    }
    if (a === "--scan-id") {
      const v = args.shift();
      const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!v || !UUID_RE.test(String(v).trim())) {
        throw new Error("--scan-id requires a valid UUID");
      }
      out.scanId = String(v).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }
  if (out.deleteOldObjects && !out.execute) {
    throw new Error("--delete-old-objects requires --execute");
  }
  if (out.execute && out.dryRun) {
    throw new Error("Use either --execute or --dry-run, not both");
  }
  if (!out.execute && !out.dryRun) {
    out.dryRun = true;
  }
  return out;
}

/**
 * @param {MigrateS3KeysCli} filters
 * @returns {{ sql: string; values: unknown[] }}
 */
function buildS3StructuredMigrationQuery(filters) {
  const parts = [
    `source_type = 'upload'`,
    `LOWER(TRIM(storage_provider)) = 's3'`,
    `storage_key IS NOT NULL`,
    `TRIM(storage_key) <> ''`,
    `user_id IS NOT NULL`,
    `storage_migrated_at IS NULL`
  ];
  const values = [];
  let n = 1;
  if (filters.scanId) {
    parts.push(`id = $${n++}`);
    values.push(filters.scanId);
  }
  let sql = `SELECT id, user_id, mime_type, filename, file_size_bytes, storage_key, storage_provider,
                    storage_migrated_at, old_storage_key, created_at
     FROM scans WHERE ${parts.join(" AND ")}
     ORDER BY created_at ASC, id ASC`;
  if (filters.limit != null) {
    sql += ` LIMIT $${n++}`;
    values.push(filters.limit);
  }
  return { sql, values };
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} objectStoragePrefix
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function classifyRowForS3StructuredMigration(row, objectStoragePrefix) {
  if (!row.user_id) {
    return { ok: false, reason: "missing_user_id" };
  }
  const sk = row.storage_key == null ? "" : String(row.storage_key).trim();
  if (!sk) {
    return { ok: false, reason: "empty_storage_key" };
  }
  if (isStructuredOriginalScanStorageKey(sk, objectStoragePrefix)) {
    return { ok: false, reason: "already_structured" };
  }
  return { ok: true };
}

function printMigrateS3KeysHelp() {
  console.info(`migrate-s3-scan-keys-to-structured-layout — copy existing S3 originals into the structured key layout.

Usage:
  dotenv -e .env -- node apps/api/src/scripts/migrate-s3-scan-keys-to-structured-layout.js [options]

Options:
  --dry-run              Default: list planned copies (no S3 CopyObject, no DB updates).
  --execute              CopyObject + Head verify + DB update (sets old_storage_key, storage_migrated_at).
  --delete-old-objects   After a successful row update, DeleteObject the previous key (requires --execute).
  --limit N
  --scan-id UUID

Requires DB columns old_storage_key, storage_migrated_at (run npm run db:migrate in apps/api).

Env: DATABASE_URL, full OBJECT_STORAGE_* (same as API). Does not delete old objects unless --delete-old-objects.
`);
}

module.exports = {
  parseMigrateS3KeysCli,
  buildS3StructuredMigrationQuery,
  classifyRowForS3StructuredMigration,
  plannedStructuredS3StorageKey,
  printMigrateS3KeysHelp
};
