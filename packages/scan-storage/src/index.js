const { LocalScanStorage, uploadBaseDir, absolutePathForStorageKey } = require("./localScanStorage");
const { S3ScanStorage } = require("./s3ScanStorage");
const {
  normalizeObjectStorageProvider,
  validateObjectStorageConfig,
  assertS3ObjectStorageEnv,
  describeObjectStorageReadiness
} = require("./validation");
const {
  createScanObjectStorageFromEnv,
  getScanObjectStorage,
  getStorageForProvider,
  resetScanObjectStorageSingletonForTests
} = require("./factory");
const { safeOriginalSegment, buildObjectKey } = require("./keyUtil");

module.exports = {
  LocalScanStorage,
  S3ScanStorage,
  uploadBaseDir,
  absolutePathForStorageKey,
  normalizeObjectStorageProvider,
  validateObjectStorageConfig,
  assertS3ObjectStorageEnv,
  describeObjectStorageReadiness,
  createScanObjectStorageFromEnv,
  getScanObjectStorage,
  getStorageForProvider,
  resetScanObjectStorageSingletonForTests,
  safeOriginalSegment,
  buildObjectKey
};
