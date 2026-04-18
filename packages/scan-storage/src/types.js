/**
 * @typedef {object} SaveUploadResult
 * @property {string} storageKey
 * @property {'local'|'s3'} storageProvider
 * @property {number} [sizeBytes]
 */

/**
 * @typedef {object} ScanObjectStorage
 * @property {'local'|'s3'} providerId
 * @property {(params: { scanId: string; buffer: Buffer; originalName: string; contentType?: string }) => Promise<SaveUploadResult>} saveUpload
 * @property {(storageKey: string) => Promise<{ exists: boolean; size?: number; contentType?: string | null }>} getObjectInfo
 * @property {(storageKey: string) => Promise<import('stream').Readable>} getDownloadStream
 * @property {(params: { storageKey: string; buffer: Buffer; contentType?: string }) => Promise<void>} [putBufferAtStorageKey]
 * @property {(storageKey: string) => Promise<void>} [deleteObject]
 */

module.exports = {};
