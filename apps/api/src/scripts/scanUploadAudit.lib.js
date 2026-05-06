"use strict";

const path = require("path");
const fs = require("fs/promises");

const { buildS3ObjectKeyFromLegacyLocalStorageKey, normalizeUploadStorageProvider } = require("./migrateLocalUploadsToS3.lib");
const { buildStructuredScanRelativeKey, applyObjectKeyPrefix } = require("@media-auth/scan-storage");

/**
 * @typedef {'local'|'s3'|'all'} ProviderFilter
 */

/**
 * @typedef {object} AuditCliOptions
 * @property {boolean} help
 * @property {boolean} json
 * @property {boolean} strict
 * @property {boolean} checkS3
 * @property {boolean} checkLocal
 * @property {boolean} scanOrphans
 * @property {number | null} limit
 * @property {string | null} scanId
 * @property {string | null} beforeIso
 * @property {string | null} afterIso
 * @property {ProviderFilter} onlyProvider
 */

const LEGACY_FLAT_UPLOAD_REL_RE = /^[0-9a-fA-F-]{36}\/[^\\/]+$/;
const STRUCTURED_UPLOAD_REL_RE =
  /^scans\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(original|derived|metadata)\/[A-Za-z0-9._-]+$/i;

/**
 * Strip OBJECT_STORAGE_PREFIX from a DB `storage_key` when present; return relative upload path or invalid.
 * Accepts legacy flat `uuid/file` or structured `scans/users/...`.
 * @param {string} dbStorageKey
 * @param {string} objectStoragePrefix
 * @returns {{ ok: true; legacyRelative: string } | { ok: false; reason: string }}
 */
function extractLegacyLocalRelativeKey(dbStorageKey, objectStoragePrefix) {
  const sk = String(dbStorageKey || "").trim();
  if (!sk) {
    return { ok: false, reason: "empty_storage_key" };
  }
  const pref = String(objectStoragePrefix || "").trim();
  const normalizedPref = pref ? pref.replace(/\/?$/, "/") : "";
  let rel = sk;
  if (normalizedPref && sk.startsWith(normalizedPref)) {
    rel = sk.slice(normalizedPref.length);
  }
  if (LEGACY_FLAT_UPLOAD_REL_RE.test(rel) || STRUCTURED_UPLOAD_REL_RE.test(rel)) {
    return { ok: true, legacyRelative: rel };
  }
  return { ok: false, reason: "legacy_key_shape_mismatch" };
}

/**
 * @param {string[]} argv
 * @returns {AuditCliOptions}
 */
function parseAuditCliArgs(argv) {
  /** @type {AuditCliOptions} */
  const out = {
    help: false,
    json: false,
    strict: false,
    checkS3: false,
    checkLocal: true,
    scanOrphans: true,
    limit: null,
    scanId: null,
    beforeIso: null,
    afterIso: null,
    onlyProvider: "all"
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
    if (a === "--json") {
      out.json = true;
      continue;
    }
    if (a === "--strict") {
      out.strict = true;
      continue;
    }
    if (a === "--check-s3") {
      out.checkS3 = true;
      continue;
    }
    if (a === "--no-check-s3") {
      out.checkS3 = false;
      continue;
    }
    if (a === "--check-local") {
      out.checkLocal = true;
      continue;
    }
    if (a === "--no-check-local") {
      out.checkLocal = false;
      continue;
    }
    if (a === "--scan-orphans") {
      out.scanOrphans = true;
      continue;
    }
    if (a === "--no-scan-orphans") {
      out.scanOrphans = false;
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
      if (v !== "local" && v !== "s3" && v !== "all") {
        throw new Error('--only-provider must be "local", "s3", or "all"');
      }
      out.onlyProvider = /** @type {ProviderFilter} */ (v);
      continue;
    }
    throw new Error(`Unknown argument: ${a} (try --help)`);
  }
  return out;
}

/**
 * @param {AuditCliOptions} filters
 * @returns {{ sql: string; values: unknown[] }}
 */
function buildUploadScanAuditQuery(filters) {
  const parts = [`source_type = 'upload'`];
  const values = [];
  let n = 1;

  if (filters.onlyProvider === "local") {
    parts.push(`(storage_provider IS NULL OR LOWER(TRIM(storage_provider)) = 'local')`);
  } else if (filters.onlyProvider === "s3") {
    parts.push(`LOWER(TRIM(storage_provider)) = 's3'`);
  }

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

  let sql = `SELECT id, filename, mime_type, file_size_bytes, storage_key, storage_provider, source_type, created_at
     FROM scans WHERE ${parts.join(" AND ")}
     ORDER BY created_at ASC`;
  if (filters.limit != null) {
    sql += ` LIMIT $${n++}`;
    values.push(filters.limit);
  }
  return { sql, values };
}

/**
 * Classify one upload scan row after probes (pure).
 * @param {object} input
 * @param {'local'|'s3'} input.normalizedProvider
 * @param {boolean} input.hasValidStorageKey
 * @param {boolean} input.extractOk
 * @param {boolean} input.localFilePresent
 * @param {boolean} input.localFileChecked
 * @param {boolean} input.s3DbKeyPresent
 * @param {boolean} input.s3DbKeyChecked
 * @param {boolean} input.s3MigrationTargetPresent
 * @param {boolean} input.s3MigrationTargetChecked
 * @param {boolean} input.s3ErrorAny
 * @returns {string}
 */
function classifyUploadScanRow(input) {
  const {
    normalizedProvider,
    hasValidStorageKey,
    extractOk,
    localFilePresent,
    localFileChecked,
    s3DbKeyPresent,
    s3DbKeyChecked,
    s3MigrationTargetPresent,
    s3MigrationTargetChecked,
    s3ErrorAny
  } = input;

  if (s3ErrorAny) {
    return "s3_probe_error";
  }
  if (!hasValidStorageKey || !extractOk || (normalizedProvider !== "local" && normalizedProvider !== "s3")) {
    return "invalid_storage_metadata";
  }

  if (normalizedProvider === "local") {
    if (!localFileChecked) {
      return "local_file_unverified";
    }
    if (!localFilePresent) {
      return "missing_local_but_db_local";
    }
    if (s3MigrationTargetChecked) {
      if (s3MigrationTargetPresent) {
        return "local_and_s3";
      }
      return "local_only";
    }
    return "local_only";
  }

  if (s3DbKeyChecked && !s3DbKeyPresent) {
    return "db_s3_but_missing_in_s3";
  }

  const s3KnownOk = s3DbKeyChecked && s3DbKeyPresent;

  if (localFileChecked && localFilePresent) {
    if (s3KnownOk) {
      return "local_and_s3";
    }
    return "s3_db_local_file_present_unverified";
  }
  if (s3KnownOk) {
    return "s3_only";
  }
  return "s3_unverified";
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} objectStoragePrefix
 * @returns {Promise<Set<string>>}
 */
async function loadReferencedLegacyRelativeKeys(pool, objectStoragePrefix) {
  const { rows } = await pool.query(
    `SELECT storage_key FROM scans
     WHERE source_type = 'upload' AND storage_key IS NOT NULL AND TRIM(storage_key) <> ''`
  );
  const set = new Set();
  for (const r of rows) {
    const ex = extractLegacyLocalRelativeKey(String(r.storage_key), objectStoragePrefix);
    if (ex.ok) {
      set.add(ex.legacyRelative);
    }
  }
  return set;
}

/**
 * @param {string} uploadRootAbs
 * @param {Set<string>} referencedLegacyRelativeKeys `uuid/filename`
 * @returns {Promise<{ orphans: { relative: string; absolute: string }[]; error: string | null }>}
 */
async function listOrphanLocalFilesUnderUploadBase(uploadRootAbs, referencedLegacyRelativeKeys) {
  /** @type {{ relative: string; absolute: string }[]} */
  const allFiles = [];

  async function walk(absDir, relParts) {
    let ents;
    try {
      ents = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const name = ent.name;
      const nextAbs = path.join(absDir, name);
      const nextRel = relParts.length ? `${relParts.join("/")}/${name}` : name;
      if (ent.isDirectory()) {
        await walk(nextAbs, [...relParts, name]);
      } else if (ent.isFile()) {
        allFiles.push({ relative: nextRel, absolute: nextAbs });
      }
    }
  }

  try {
    await walk(uploadRootAbs, []);
  } catch (e) {
    return {
      orphans: [],
      error: String(/** @type {{ message?: string }} */ (e).message || e)
    };
  }

  const orphans = allFiles.filter((f) => !referencedLegacyRelativeKeys.has(f.relative));
  return { orphans, error: null };
}

function printAuditHelp() {
  console.info(`audit-scan-upload-storage — post-migration audit for upload scan rows + optional orphan files.

Usage:
  dotenv -e .env -- node apps/api/src/scripts/audit-scan-upload-storage.js [options]

Options:
  --only-provider=local|s3|all   Filter rows (default: all upload rows).
  --check-s3                   HeadObject for S3 keys / migration targets (needs S3 env).
  --no-check-s3
  --check-local                stat legacy local paths (default on).
  --no-check-local
  --scan-orphans               Walk local upload dir for files not referenced (default on).
  --no-scan-orphans
  --limit N, --scan-id UUID, --before ISO, --after ISO
  --json                       Machine-readable output.
  --strict                     Exit 1 if orphan_local_file > 0 as well.

Buckets (rows):
  local_only | s3_only | local_and_s3 | missing_local_but_db_local | db_s3_but_missing_in_s3 |
  invalid_storage_metadata | s3_unverified | s3_db_local_file_present_unverified | s3_probe_error |
  local_file_unverified

Orphans (files under SCAN_STORAGE_LOCAL_DIR): orphan_local_file

Exit 1: invalid_storage_metadata, missing_local_but_db_local, db_s3_but_missing_in_s3, s3_probe_error (always).
With --strict: also exit 1 if orphan_local_file, s3_unverified, local_file_unverified, or s3_db_local_file_present_unverified > 0.
`);
}

module.exports = {
  extractLegacyLocalRelativeKey,
  parseAuditCliArgs,
  buildUploadScanAuditQuery,
  classifyUploadScanRow,
  printAuditHelp,
  buildS3ObjectKeyFromLegacyLocalStorageKey,
  normalizeUploadStorageProvider,
  loadReferencedLegacyRelativeKeys,
  listOrphanLocalFilesUnderUploadBase
};
