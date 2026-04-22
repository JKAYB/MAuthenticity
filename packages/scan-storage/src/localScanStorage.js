const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { buildStructuredScanRelativeKey } = require("./keyUtil");

function repoRootFromPackage() {
  return path.resolve(__dirname, "../../..");
}

function defaultDataDir() {
  return path.join(repoRootFromPackage(), "data", "scan-uploads");
}

function uploadBaseDir() {
  const raw = process.env.SCAN_STORAGE_LOCAL_DIR;
  return raw && raw.trim() ? path.resolve(raw.trim()) : path.resolve(defaultDataDir());
}

/**
 * @param {string} storageKey
 * @returns {string} absolute path
 */
const LEGACY_LOCAL_KEY_RE = /^[0-9a-fA-F-]{36}\/[^\\/]+$/;
const STRUCTURED_LOCAL_KEY_RE =
  /^scans\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(original|derived|metadata)\/[A-Za-z0-9._-]+$/i;

function absolutePathForStorageKey(storageKey) {
  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("storage_key is missing");
  }
  const k = storageKey.trim();
  if (!LEGACY_LOCAL_KEY_RE.test(k) && !STRUCTURED_LOCAL_KEY_RE.test(k)) {
    throw new Error("Invalid storage_key");
  }
  return path.join(uploadBaseDir(), ...k.split("/"));
}

class LocalScanStorage {
  /** @param {{ prefix?: string }} [_opts] */
  constructor(_opts = {}) {
    this.providerId = "local";
    this.prefix = "";
  }

  /**
   * @param {{ userId: string; scanId: string; buffer: Buffer; originalName: string; contentType?: string }} params
   */
  async saveUpload({ userId, scanId, buffer, originalName: _originalName, contentType }) {
    const objectKey = buildStructuredScanRelativeKey({
      userId,
      scanId,
      mimeType: contentType,
      kind: "original"
    });
    const absFile = path.join(uploadBaseDir(), ...objectKey.split("/"));
    await fs.mkdir(path.dirname(absFile), { recursive: true });
    await fs.writeFile(absFile, buffer, { mode: 0o600 });
    return { storageKey: objectKey, storageProvider: "local", sizeBytes: buffer.length };
  }

  /**
   * Persist a derived artifact (e.g. Reality Defender heatmap) next to the scan upload layout.
   * @param {{ userId: string; scanId: string; assetName: string; buffer: Buffer; contentType?: string }} params
   * @returns {Promise<{ storageKey: string; storageProvider: 'local'; sizeBytes: number }>}
   */
  async saveDerivedAsset({ userId, scanId, assetName, buffer, contentType: _contentType }) {
    const objectKey = buildStructuredScanRelativeKey({
      userId,
      scanId,
      kind: "derived",
      assetName
    });
    const absFile = path.join(uploadBaseDir(), ...objectKey.split("/"));
    await fs.mkdir(path.dirname(absFile), { recursive: true });
    await fs.writeFile(absFile, buffer, { mode: 0o600 });
    return { storageKey: objectKey, storageProvider: "local", sizeBytes: buffer.length };
  }

  /**
   * @param {string} storageKey
   * @returns {Promise<{ exists: boolean; size?: number; contentType?: string | null }>}
   */
  async getObjectInfo(storageKey) {
    try {
      const abs = absolutePathForStorageKey(storageKey);
      const st = await fs.stat(abs);
      if (!st.isFile()) {
        return { exists: false };
      }
      return { exists: true, size: st.size, contentType: null };
    } catch {
      return { exists: false };
    }
  }

  /**
   * @param {string} storageKey
   * @param {{ start: number; end: number }} [byteRange] inclusive start/end (bytes)
   * @returns {Promise<import('stream').Readable>}
   */
  async getDownloadStream(storageKey, byteRange) {
    const abs = absolutePathForStorageKey(storageKey);
    if (byteRange && Number.isFinite(byteRange.start) && Number.isFinite(byteRange.end)) {
      return fsSync.createReadStream(abs, { start: byteRange.start, end: byteRange.end });
    }
    return fsSync.createReadStream(abs);
  }

  /** @param {string} storageKey */
  async deleteObject(storageKey) {
    const abs = absolutePathForStorageKey(storageKey);
    await fs.unlink(abs).catch(() => {});
  }
}

module.exports = {
  LocalScanStorage,
  uploadBaseDir,
  absolutePathForStorageKey
};
