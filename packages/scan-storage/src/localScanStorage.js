const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { buildObjectKey } = require("./keyUtil");

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
function absolutePathForStorageKey(storageKey) {
  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("storage_key is missing");
  }
  if (!/^[0-9a-fA-F-]{36}\/[^\\/]+$/.test(storageKey)) {
    throw new Error("Invalid storage_key");
  }
  return path.join(uploadBaseDir(), storageKey);
}

class LocalScanStorage {
  /** @param {{ prefix?: string }} [_opts] */
  constructor(_opts = {}) {
    this.providerId = "local";
    this.prefix = "";
  }

  /**
   * @param {{ scanId: string; buffer: Buffer; originalName: string; contentType?: string }} params
   */
  async saveUpload({ scanId, buffer, originalName }) {
    const { objectKey } = buildObjectKey({ scanId, originalName, prefix: "" });
    const absDir = path.join(uploadBaseDir(), scanId);
    const absFile = path.join(uploadBaseDir(), objectKey);
    await fs.mkdir(absDir, { recursive: true });
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
   * @returns {Promise<import('stream').Readable>}
   */
  async getDownloadStream(storageKey) {
    const abs = absolutePathForStorageKey(storageKey);
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
