const { LocalScanStorage } = require("./localScanStorage");
const { S3ScanStorage } = require("./s3ScanStorage");
const {
  normalizeObjectStorageProvider,
  validateObjectStorageConfig,
  assertS3ObjectStorageEnv
} = require("./validation");

/**
 * Active writer/read backend from env (`OBJECT_STORAGE_PROVIDER`).
 * @returns {import('./types').ScanObjectStorage}
 */
function createScanObjectStorageFromEnv() {
  validateObjectStorageConfig();
  const p = normalizeObjectStorageProvider();
  return getStorageForProvider(p);
}

/** @type {LocalScanStorage | null} */
let localSingleton = null;
/** @type {S3ScanStorage | null} */
let s3Singleton = null;

/**
 * Backend for a persisted scan row (`storage_provider` from DB, or `local` when null).
 * @param {string | null | undefined} providerId
 * @returns {import('./types').ScanObjectStorage}
 */
function getStorageForProvider(providerId) {
  const p = providerId && String(providerId).trim() ? String(providerId).trim().toLowerCase() : "local";
  if (p === "local") {
    if (!localSingleton) {
      localSingleton = new LocalScanStorage();
    }
    return localSingleton;
  }
  if (p === "s3") {
    if (!s3Singleton) {
      assertS3ObjectStorageEnv();
      s3Singleton = new S3ScanStorage();
    }
    return s3Singleton;
  }
  if (p === "gcs") {
    throw new Error("storage_provider=gcs is not implemented");
  }
  throw new Error(`Unknown storage_provider: ${p}`);
}

let activeSingleton;
/**
 * Lazy singleton matching `OBJECT_STORAGE_PROVIDER` (API upload path).
 * @returns {import('./types').ScanObjectStorage}
 */
function getScanObjectStorage() {
  if (!activeSingleton) {
    activeSingleton = createScanObjectStorageFromEnv();
  }
  return activeSingleton;
}

function resetScanObjectStorageSingletonForTests() {
  activeSingleton = undefined;
  localSingleton = null;
  s3Singleton = null;
}

module.exports = {
  createScanObjectStorageFromEnv,
  getScanObjectStorage,
  getStorageForProvider,
  resetScanObjectStorageSingletonForTests
};
