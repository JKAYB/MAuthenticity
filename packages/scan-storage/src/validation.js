/**
 * @returns {string} normalized provider id: local | s3 | gcs
 */
function normalizeObjectStorageProvider() {
  const raw = String(process.env.OBJECT_STORAGE_PROVIDER || "local")
    .trim()
    .toLowerCase();
  if (!raw) return "local";
  return raw;
}

/**
 * Validates env for the active `OBJECT_STORAGE_PROVIDER`. Call after dotenv.
 * @throws {Error} when configuration is invalid or GCS is selected (not implemented).
 */
function assertS3ObjectStorageEnv() {
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
  const region = process.env.OBJECT_STORAGE_REGION?.trim();
  const ak = process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim();
  const sk = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();
  if (!bucket) {
    throw new Error("OBJECT_STORAGE_BUCKET is required for S3-backed scans");
  }
  if (!region) {
    throw new Error("OBJECT_STORAGE_REGION is required for S3-backed scans");
  }
  if (!ak || !sk) {
    throw new Error(
      "OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY are required for S3-backed scans"
    );
  }
}

function validateObjectStorageConfig() {
  const p = normalizeObjectStorageProvider();
  if (p === "gcs") {
    throw new Error(
      "OBJECT_STORAGE_PROVIDER=gcs is not implemented yet. Use OBJECT_STORAGE_PROVIDER=local or s3."
    );
  }
  if (p === "s3") {
    assertS3ObjectStorageEnv();
  }
  if (p !== "local" && p !== "s3") {
    throw new Error(`OBJECT_STORAGE_PROVIDER must be local, s3, or gcs (got "${p}")`);
  }
  return { provider: p };
}

/**
 * @returns {{ ok: boolean; provider: string; issues: string[] }}
 */
function describeObjectStorageReadiness() {
  let provider = "local";
  try {
    const r = validateObjectStorageConfig();
    provider = r.provider;
    return { ok: true, provider, issues: [] };
  } catch (e) {
    return { ok: false, provider, issues: [e.message || String(e)] };
  }
}

module.exports = {
  normalizeObjectStorageProvider,
  validateObjectStorageConfig,
  assertS3ObjectStorageEnv,
  describeObjectStorageReadiness
};
