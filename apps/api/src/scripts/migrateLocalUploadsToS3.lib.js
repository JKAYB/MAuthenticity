"use strict";

/**
 * Shared logic for migrating legacy local-disk upload scans to S3.
 * Used by `migrate-local-uploads-to-s3.js` and unit tests.
 */

/**
 * @param {unknown} storage_provider
 * @returns {'local'|'s3'|'gcs'|string}
 */
function normalizeUploadStorageProvider(storage_provider) {
  const s = storage_provider == null ? "" : String(storage_provider).trim().toLowerCase();
  if (!s) {
    return "local";
  }
  return s;
}

/**
 * Upload row eligible for local → S3 migration (matches worker "local" resolution).
 * @param {Record<string, unknown>} row
 * @returns {boolean}
 */
function isEligibleLocalUploadScan(row) {
  if (!row || row.source_type !== "upload") {
    return false;
  }
  const sk = row.storage_key;
  if (sk == null || !String(sk).trim()) {
    return false;
  }
  return normalizeUploadStorageProvider(row.storage_provider) === "local";
}

/**
 * Maps a legacy on-disk relative key (`{scanId}/{filename}`) to the S3 object key the worker uses,
 * including `OBJECT_STORAGE_PREFIX` (same rules as {@link S3ScanStorage#saveUpload}).
 * @param {string} legacyLocalStorageKey
 * @param {string} [objectStoragePrefix] from env OBJECT_STORAGE_PREFIX
 * @returns {string}
 */
function buildS3ObjectKeyFromLegacyLocalStorageKey(legacyLocalStorageKey, objectStoragePrefix = "") {
  const key = String(legacyLocalStorageKey || "").trim();
  if (!key) {
    throw new Error("legacyLocalStorageKey is required");
  }
  const prefix = String(objectStoragePrefix || "").trim();
  const p = prefix ? prefix.replace(/\/?$/, "/") : "";
  return `${p}${key}`;
}

/**
 * @typedef {object} CliFilters
 * @property {boolean} dryRun
 * @property {boolean} verifyOnly
 * @property {boolean} checkS3InVerify
 * @property {number | null} limit
 * @property {string | null} scanId
 * @property {string | null} beforeIso
 * @property {string | null} afterIso
 * @property {'local'} onlyProvider
 */

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {CliFilters & { help: boolean }}
 */
function parseCliArgs(argv) {
  /** @type {CliFilters & { help: boolean }} */
  const out = {
    help: false,
    dryRun: false,
    verifyOnly: false,
    checkS3InVerify: false,
    limit: null,
    scanId: null,
    beforeIso: null,
    afterIso: null,
    onlyProvider: "local"
  };
  const args = argv.slice();
  while (args.length) {
    const a = args.shift();
    if (!a) {
      continue;
    }
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--verify-only") {
      out.verifyOnly = true;
      continue;
    }
    if (a === "--check-s3") {
      out.checkS3InVerify = true;
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
      if (!v || !String(v).trim()) {
        throw new Error("--scan-id requires a UUID");
      }
      out.scanId = String(v).trim();
      continue;
    }
    if (a === "--before") {
      const v = args.shift();
      if (!v || !String(v).trim()) {
        throw new Error("--before requires an ISO-8601 timestamp");
      }
      out.beforeIso = String(v).trim();
      continue;
    }
    if (a === "--after") {
      const v = args.shift();
      if (!v || !String(v).trim()) {
        throw new Error("--after requires an ISO-8601 timestamp");
      }
      out.afterIso = String(v).trim();
      continue;
    }
    if (a.startsWith("--only-provider=")) {
      const v = a.split("=")[1]?.trim().toLowerCase();
      if (v !== "local") {
        throw new Error('--only-provider must be "local" (this tool only migrates local-backed uploads)');
      }
      out.onlyProvider = "local";
      continue;
    }
    throw new Error(`Unknown argument: ${a} (try --help)`);
  }
  if (out.verifyOnly && out.dryRun) {
    throw new Error("Use either --verify-only or --dry-run, not both");
  }
  return out;
}

/**
 * @param {CliFilters} filters
 * @returns {{ sql: string; values: unknown[] }}
 */
function buildCandidateQuery(filters) {
  if (filters.onlyProvider !== "local") {
    throw new Error('onlyProvider must be "local"');
  }
  const parts = [
    `source_type = 'upload'`,
    `storage_key IS NOT NULL`,
    `TRIM(storage_key) <> ''`,
    `(storage_provider IS NULL OR LOWER(TRIM(storage_provider)) = 'local')`
  ];
  const values = [];
  let n = 1;
  if (filters.scanId) {
    parts.push(`id = $${n++}`);
    values.push(filters.scanId);
  }
  if (filters.afterIso) {
    parts.push(`created_at > $${n++}`);
    values.push(filters.afterIso);
  }
  if (filters.beforeIso) {
    parts.push(`created_at < $${n++}`);
    values.push(filters.beforeIso);
  }
  let sql = `SELECT id, user_id, filename, mime_type, file_size_bytes, storage_key, storage_provider, source_type, created_at
     FROM scans WHERE ${parts.join(" AND ")}
     ORDER BY created_at ASC`;
  if (filters.limit != null) {
    sql += ` LIMIT $${n++}`;
    values.push(filters.limit);
  }
  return { sql, values };
}

function printHelp() {
  console.info(`migrate-local-uploads-to-s3 — copy legacy local upload files to S3 and update scan rows.

Usage:
  dotenv -e .env -- node apps/api/src/scripts/migrate-local-uploads-to-s3.js [options]

Options:
  --dry-run           List candidates and planned S3 keys; no S3 upload, no DB updates.
  --verify-only       Read-only: local file presence (and optional S3 head); no DB updates.
  --check-s3          With --verify-only: also HeadObject target key (requires S3 env).
  --limit N           Max rows to process from the candidate query.
  --scan-id UUID      Restrict to a single scan id.
  --before ISO        created_at < value (Postgres-parsable timestamp).
  --after ISO         created_at > value.
  --only-provider=local  Default; other values are rejected.

Safety:
  - Does not delete local files.
  - Skips rows already on S3.
  - DB is updated only after local read + S3 upload + Head verification (non dry-run).
  - Each scan row must have user_id set (required for structured S3 keys scans/users/{userId}/{scanId}/original/...).

Env (S3, except --dry-run without S3): same as production — OBJECT_STORAGE_BUCKET, REGION, keys, optional PREFIX/ENDPOINT.
Local files: SCAN_STORAGE_LOCAL_DIR or default data/scan-uploads.

After migration, run the audit tool (see OPERATIONS §4.8): audit-scan-upload-storage.js
`);
}

module.exports = {
  normalizeUploadStorageProvider,
  isEligibleLocalUploadScan,
  buildS3ObjectKeyFromLegacyLocalStorageKey,
  parseCliArgs,
  buildCandidateQuery,
  printHelp
};
