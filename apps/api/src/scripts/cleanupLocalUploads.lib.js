"use strict";

/**
 * @typedef {object} CleanupCliOptions
 * @property {boolean} help
 * @property {boolean} execute
 * @property {number | null} limit
 * @property {string | null} scanId
 * @property {string | null} olderThanIso
 */

/**
 * @param {string[]} argv
 * @returns {CleanupCliOptions}
 */
function parseCleanupCliArgs(argv) {
  /** @type {CleanupCliOptions} */
  const out = {
    help: false,
    execute: false,
    limit: null,
    scanId: null,
    olderThanIso: null
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
    if (a === "--execute") {
      out.execute = true;
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
    if (a === "--older-than") {
      const v = args.shift();
      if (!v || !String(v).trim()) {
        throw new Error("--older-than requires an ISO-8601 timestamp");
      }
      out.olderThanIso = String(v).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${a} (try --help)`);
  }
  return out;
}

/**
 * @param {Date | string} createdAt
 * @param {string | null} olderThanIso
 * @returns {boolean}
 */
function rowCreatedBefore(createdAt, olderThanIso) {
  if (!olderThanIso) {
    return true;
  }
  const t = new Date(createdAt).getTime();
  const cut = new Date(olderThanIso).getTime();
  if (Number.isNaN(t) || Number.isNaN(cut)) {
    return false;
  }
  return t < cut;
}

/**
 * Conservative gate for deleting the legacy local file for an S3-backed row.
 * @param {object} p
 * @param {boolean} p.isS3BackedRow
 * @param {boolean} p.extractOk
 * @param {boolean} p.s3ObjectExists
 * @param {boolean} p.s3Checked
 * @param {boolean} p.localLegacyFileExists
 * @param {boolean} p.localChecked
 * @param {boolean} p.ageOk
 * @returns {{ ok: boolean; reason?: string }}
 */
function qualifiesForLocalDeletion(p) {
  if (!p.isS3BackedRow) {
    return { ok: false, reason: "not_s3_backed" };
  }
  if (!p.extractOk) {
    return { ok: false, reason: "invalid_legacy_key" };
  }
  if (!p.s3Checked) {
    return { ok: false, reason: "s3_not_verified" };
  }
  if (!p.s3ObjectExists) {
    return { ok: false, reason: "s3_object_missing" };
  }
  if (!p.localChecked) {
    return { ok: false, reason: "local_not_checked" };
  }
  if (!p.localLegacyFileExists) {
    return { ok: false, reason: "no_local_file" };
  }
  if (!p.ageOk) {
    return { ok: false, reason: "newer_than_cutoff" };
  }
  return { ok: true };
}

/**
 * @param {CleanupCliOptions} filters
 * @returns {{ sql: string; values: unknown[] }}
 */
function buildS3UploadCleanupQuery(filters) {
  const parts = [
    `source_type = 'upload'`,
    `LOWER(TRIM(storage_provider)) = 's3'`,
    `storage_key IS NOT NULL`,
    `TRIM(storage_key) <> ''`
  ];
  const values = [];
  let n = 1;
  if (filters.scanId) {
    parts.push(`id = $${n++}`);
    values.push(filters.scanId);
  }
  if (filters.olderThanIso) {
    parts.push(`created_at < $${n++}`);
    values.push(filters.olderThanIso);
  }
  let sql = `SELECT id, filename, storage_key, storage_provider, created_at
     FROM scans WHERE ${parts.join(" AND ")}
     ORDER BY created_at ASC`;
  if (filters.limit != null) {
    sql += ` LIMIT $${n++}`;
    values.push(filters.limit);
  }
  return { sql, values };
}

function printCleanupHelp() {
  console.info(`cleanup-local-upload-files — delete legacy on-disk copies for S3-backed upload rows (guarded).

Default: dry-run only (logs proposed deletions). No file is removed unless you pass --execute.

Requirements per row:
  - storage_provider is s3
  - S3 HeadObject confirms object exists (always checked)
  - Legacy local file exists under SCAN_STORAGE_LOCAL_DIR
  - Optional --older-than ISO filter (created_at < value)

Options:
  --execute          Actually unlink legacy local files (still never touches S3 or DB).
  --limit N, --scan-id UUID, --older-than ISO

This is a scaffold: run audit-scan-upload-storage --check-s3 --check-local first, then dry-run here, then --execute in a maintenance window.
`);
}

module.exports = {
  parseCleanupCliArgs,
  rowCreatedBefore,
  qualifiesForLocalDeletion,
  buildS3UploadCleanupQuery,
  printCleanupHelp
};
