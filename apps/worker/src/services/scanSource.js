const fs = require("fs/promises");
const { UnrecoverableError } = require("bullmq");
const { getStorageForProvider, absolutePathForStorageKey } = require("@media-auth/scan-storage");
const { materializeDownloadStreamToTempFile, safeUnlink } = require("../storage/tempObjectDownload");

/**
 * @typedef {object} ScanMediaInput
 * @property {'upload'|'url'} sourceType
 * @property {string} originalFilename
 * @property {string} mimeType
 * @property {number} fileSizeBytes
 * @property {string | null} localPath
 * @property {string | null} sourceUrl
 * @property {string | null} storageKey
 * @property {boolean} legacyMetadataOnly
 */

/**
 * @param {import('pg').Pool} pool
 * @param {string} scanId
 */
async function loadScanRow(pool, scanId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, status, filename, mime_type, file_size_bytes,
            source_type, source_url, storage_key, storage_provider
     FROM scans WHERE id = $1`,
    [scanId]
  );
  return rows[0] || null;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Promise<{ input: ScanMediaInput; release: () => Promise<void> }>}
 */
async function resolveMediaInput(row) {
  const noopRelease = async () => {};

  const sourceType = row.source_type === "url" ? "url" : "upload";
  const originalFilename = row.filename;
  const mimeType = row.mime_type;
  const fileSizeBytes = Number(row.file_size_bytes) || 0;

  if (sourceType === "url") {
    if (!row.source_url || typeof row.source_url !== "string") {
      throw new UnrecoverableError("URL scan is missing source_url");
    }
    return {
      input: {
        sourceType: "url",
        originalFilename,
        mimeType,
        fileSizeBytes,
        localPath: null,
        sourceUrl: row.source_url,
        storageKey: null,
        legacyMetadataOnly: false
      },
      release: noopRelease
    };
  }

  if (!row.storage_key) {
    return {
      input: {
        sourceType: "upload",
        originalFilename,
        mimeType,
        fileSizeBytes,
        localPath: null,
        sourceUrl: null,
        storageKey: null,
        legacyMetadataOnly: true
      },
      release: noopRelease
    };
  }

  const storageProvider = row.storage_provider ? String(row.storage_provider).trim().toLowerCase() : "local";

  if (storageProvider === "local") {
    let abs;
    try {
      abs = absolutePathForStorageKey(row.storage_key);
    } catch (e) {
      throw new UnrecoverableError(e.message || "Invalid storage_key");
    }

    try {
      const st = await fs.stat(abs);
      if (!st.isFile()) {
        throw new UnrecoverableError(`Upload path is not a file: ${row.storage_key}`);
      }
    } catch (e) {
      if (e instanceof UnrecoverableError) {
        throw e;
      }
      throw new UnrecoverableError(
        `Stored upload not found for key=${row.storage_key}: ${e.message || "stat failed"}`
      );
    }

    return {
      input: {
        sourceType: "upload",
        originalFilename,
        mimeType,
        fileSizeBytes,
        localPath: abs,
        sourceUrl: null,
        storageKey: row.storage_key,
        legacyMetadataOnly: false
      },
      release: noopRelease
    };
  }

  if (storageProvider === "s3") {
    let tempPath;
    try {
      const storage = getStorageForProvider("s3");
      const info = await storage.getObjectInfo(row.storage_key);
      if (!info.exists) {
        throw new UnrecoverableError(`S3 object missing for key=${row.storage_key}`);
      }
      const stream = await storage.getDownloadStream(row.storage_key);
      tempPath = await materializeDownloadStreamToTempFile({
        readStream: stream,
        scanId: row.id,
        filenameHint: originalFilename
      });
    } catch (e) {
      if (e instanceof UnrecoverableError) {
        throw e;
      }
      throw new UnrecoverableError(`Failed to download upload from object storage: ${e.message || e}`);
    }

    return {
      input: {
        sourceType: "upload",
        originalFilename,
        mimeType,
        fileSizeBytes,
        localPath: tempPath,
        sourceUrl: null,
        storageKey: row.storage_key,
        legacyMetadataOnly: false
      },
      release: async () => {
        await safeUnlink(tempPath);
      }
    };
  }

  throw new UnrecoverableError(`Unsupported storage_provider: ${storageProvider}`);
}

module.exports = {
  loadScanRow,
  resolveMediaInput
};
