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
const {
  safeOriginalSegment,
  buildObjectKey,
  assertUuid,
  extensionForMimeType,
  buildStructuredScanRelativeKey,
  applyObjectKeyPrefix,
  stripObjectKeyPrefix,
  isStructuredOriginalScanRelativeKey,
  isStructuredOriginalScanStorageKey,
  plannedStructuredS3StorageKey,
  MIME_TO_EXT
} = require("./keyUtil");
const {
  analyzePresignedHeatmapUrl,
  parseAmzDateToUtcMs,
  isVendorPresignedUrlExpiredOrNear
} = require("./presignedUrlInspect");

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
  buildObjectKey,
  assertUuid,
  extensionForMimeType,
  buildStructuredScanRelativeKey,
  applyObjectKeyPrefix,
  stripObjectKeyPrefix,
  isStructuredOriginalScanRelativeKey,
  isStructuredOriginalScanStorageKey,
  plannedStructuredS3StorageKey,
  MIME_TO_EXT,
  analyzePresignedHeatmapUrl,
  parseAmzDateToUtcMs,
  isVendorPresignedUrlExpiredOrNear
};
