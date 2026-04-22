const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand
} = require("@aws-sdk/client-s3");
const { buildStructuredScanRelativeKey, applyObjectKeyPrefix } = require("./keyUtil");

function truthy(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

class S3ScanStorage {
  constructor() {
    this.providerId = "s3";
    this.bucket = String(process.env.OBJECT_STORAGE_BUCKET || "").trim();
    this.prefix = (process.env.OBJECT_STORAGE_PREFIX || "").trim();
    const region = String(process.env.OBJECT_STORAGE_REGION || "").trim();
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim();
    const forcePathStyle = truthy(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE);

    /** @type {import('@aws-sdk/client-s3').S3ClientConfig} */
    const cfg = {
      region,
      credentials: {
        accessKeyId: String(process.env.OBJECT_STORAGE_ACCESS_KEY_ID || "").trim(),
        secretAccessKey: String(process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || "").trim()
      }
    };
    if (endpoint) {
      cfg.endpoint = endpoint;
      cfg.forcePathStyle = forcePathStyle;
    }
    this.client = new S3Client(cfg);
  }

  /**
   * @param {{ userId: string; scanId: string; buffer: Buffer; originalName: string; contentType?: string }} params
   */
  async saveUpload({ userId, scanId, buffer, originalName: _originalName, contentType }) {
    const relative = buildStructuredScanRelativeKey({
      userId,
      scanId,
      mimeType: contentType,
      kind: "original"
    });
    const objectKey = applyObjectKeyPrefix(this.prefix, relative);
    await this.putBufferAtStorageKey({
      storageKey: objectKey,
      buffer,
      contentType: contentType || "application/octet-stream"
    });
    return { storageKey: objectKey, storageProvider: "s3", sizeBytes: buffer.length };
  }

  /**
   * Persist a derived artifact under the structured scan prefix (same bucket as uploads).
   * @param {{ userId: string; scanId: string; assetName: string; buffer: Buffer; contentType?: string }} params
   * @returns {Promise<{ storageKey: string; storageProvider: 's3'; sizeBytes: number }>}
   */
  async saveDerivedAsset({ userId, scanId, assetName, buffer, contentType }) {
    const relative = buildStructuredScanRelativeKey({
      userId,
      scanId,
      kind: "derived",
      assetName
    });
    const objectKey = applyObjectKeyPrefix(this.prefix, relative);
    await this.putBufferAtStorageKey({
      storageKey: objectKey,
      buffer,
      contentType: contentType || "application/octet-stream"
    });
    return { storageKey: objectKey, storageProvider: "s3", sizeBytes: buffer.length };
  }

  /**
   * Server-side copy within the same bucket (ops / migrations).
   * @param {{ sourceKey: string; destinationKey: string }} params
   */
  async copyObject({ sourceKey, destinationKey }) {
    const src = String(sourceKey || "").trim();
    const dest = String(destinationKey || "").trim();
    if (!src || !dest) {
      throw new Error("copyObject requires sourceKey and destinationKey");
    }
    const copySource = `${this.bucket}/${src
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/")}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: copySource,
        Key: dest,
        MetadataDirective: "COPY"
      })
    );
  }

  /**
   * Put bytes at an explicit object key (used by ops migrations; key must match worker Head/Get expectations).
   * @param {{ storageKey: string; buffer: Buffer; contentType?: string }} params
   */
  async putBufferAtStorageKey({ storageKey, buffer, contentType }) {
    const key = String(storageKey || "").trim();
    if (!key) {
      throw new Error("storageKey is required");
    }
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("buffer must be a Buffer");
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
        ContentLength: buffer.length
      })
    );
  }

  /**
   * @param {string} storageKey
   * @returns {Promise<{ exists: boolean; size?: number; contentType?: string | null }>}
   */
  async getObjectInfo(storageKey) {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storageKey
        })
      );
      return {
        exists: true,
        size: Number(out.ContentLength) || undefined,
        contentType: out.ContentType || null
      };
    } catch (e) {
      const code = e && (e.name || e.Code || "");
      if (e?.$metadata?.httpStatusCode === 404 || String(code).includes("NotFound")) {
        return { exists: false };
      }
      throw e;
    }
  }

  /**
   * @param {string} storageKey
   * @param {{ start: number; end: number }} [byteRange] inclusive start/end (bytes); maps to HTTP Range
   * @returns {Promise<import('stream').Readable>}
   */
  async getDownloadStream(storageKey, byteRange) {
    /** @type {import('@aws-sdk/client-s3').GetObjectCommandInput} */
    const input = {
      Bucket: this.bucket,
      Key: storageKey
    };
    if (byteRange && Number.isFinite(byteRange.start) && Number.isFinite(byteRange.end)) {
      input.Range = `bytes=${byteRange.start}-${byteRange.end}`;
    }
    const out = await this.client.send(new GetObjectCommand(input));
    if (!out.Body) {
      throw new Error("S3 GetObject returned empty body");
    }
    return /** @type {import('stream').Readable} */ (out.Body);
  }

  /** @param {string} storageKey */
  async deleteObject(storageKey) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey
      })
    );
  }
}

module.exports = { S3ScanStorage };
