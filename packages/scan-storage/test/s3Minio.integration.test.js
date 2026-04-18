"use strict";

/**
 * Optional real S3 / MinIO integration tests.
 *
 * Enable: RUN_S3_INTEGRATION=1 plus full S3 env (bucket, region, access key, secret).
 * MinIO: set OBJECT_STORAGE_ENDPOINT (e.g. http://127.0.0.1:9000) and OBJECT_STORAGE_FORCE_PATH_STYLE=1.
 *
 * Normal `npm run test` in this package skips this file's suite when the gate is off.
 */

const path = require("path");
const { randomUUID } = require("crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { S3ScanStorage } = require("../src/s3ScanStorage");

/** Same rule as ops migration: full S3 key = normalized prefix + legacy `uuid/file`. */
function fullS3KeyFromLegacyLocalKey(legacyKey) {
  const p = String(process.env.OBJECT_STORAGE_PREFIX || "").trim();
  const norm = p ? p.replace(/\/?$/, "/") : "";
  return `${norm}${legacyKey}`;
}

function truthy(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function s3IntegrationEnabled() {
  return (
    truthy(process.env.RUN_S3_INTEGRATION) &&
    Boolean(process.env.OBJECT_STORAGE_BUCKET?.trim()) &&
    Boolean(process.env.OBJECT_STORAGE_REGION?.trim()) &&
    Boolean(process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim()) &&
    Boolean(process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim())
  );
}

require("dotenv").config({
  path: path.resolve(__dirname, "../../../.env")
});

async function readStreamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) {
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const d = s3IntegrationEnabled() ? describe : describe.skip;

d("S3 scan storage (optional MinIO / S3 integration)", () => {
  /** @type {string[]} */
  const keysToDelete = [];

  after(async () => {
    const s3 = new S3ScanStorage();
    for (const key of keysToDelete) {
      try {
        await s3.deleteObject(key);
      } catch {
        /* ignore */
      }
    }
  });

  it("saveUpload then head and download stream roundtrip", async () => {
    const s3 = new S3ScanStorage();
    const scanId = randomUUID();
    const buf = Buffer.from(`s3-it-${Date.now()}`);
    const { storageKey, storageProvider, sizeBytes } = await s3.saveUpload({
      scanId,
      buffer: buf,
      originalName: "probe.png",
      contentType: "image/png"
    });
    assert.equal(storageProvider, "s3");
    assert.ok(storageKey.includes(scanId), `storageKey=${storageKey}`);
    assert.ok(storageKey.includes("probe.png"), `storageKey=${storageKey}`);
    const pref = String(process.env.OBJECT_STORAGE_PREFIX || "").trim();
    if (pref) {
      const norm = pref.replace(/\/?$/, "/");
      assert.ok(storageKey.startsWith(norm), `storageKey=${storageKey}`);
    }
    assert.equal(sizeBytes, buf.length);
    keysToDelete.push(storageKey);

    const info = await s3.getObjectInfo(storageKey);
    assert.equal(info.exists, true);
    assert.equal(info.size, buf.length);

    const stream = await s3.getDownloadStream(storageKey);
    const out = await readStreamToBuffer(stream);
    assert.deepEqual(out, buf);
  });

  it("putBufferAtStorageKey preserves explicit storage_key and head returns size", async () => {
    const s3 = new S3ScanStorage();
    const scanId = randomUUID();
    const legacyKey = `${scanId}/migrated.bin`;
    const targetKey = fullS3KeyFromLegacyLocalKey(legacyKey);
    const buf = Buffer.from("migration-shaped-key");
    await s3.putBufferAtStorageKey({
      storageKey: targetKey,
      buffer: buf,
      contentType: "application/octet-stream"
    });
    keysToDelete.push(targetKey);

    const info = await s3.getObjectInfo(targetKey);
    assert.equal(info.exists, true);
    assert.equal(info.size, buf.length);

    const missing = await s3.getObjectInfo(`${targetKey}-does-not-exist`);
    assert.equal(missing.exists, false);
  });

  it("getObjectInfo returns exists false for missing key", async () => {
    const s3 = new S3ScanStorage();
    const info = await s3.getObjectInfo(`00000000-0000-4000-8000-${Date.now().toString(16).slice(0, 12)}/nope.bin`);
    assert.equal(info.exists, false);
  });

  it("getDownloadStream throws for missing object", async () => {
    const s3 = new S3ScanStorage();
    const badKey = `00000000-0000-4000-8000-000000000001/missing-${Date.now()}.bin`;
    await assert.rejects(async () => {
      await s3.getDownloadStream(badKey);
    });
  });
});
