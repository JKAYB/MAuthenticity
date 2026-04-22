"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { LocalScanStorage } = require("../src/localScanStorage");

describe("local scan storage", () => {
  let tmpDir;
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-storage-test-"));
    process.env.SCAN_STORAGE_LOCAL_DIR = tmpDir;
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    delete process.env.SCAN_STORAGE_LOCAL_DIR;
  });

  it("saveUpload then getObjectInfo and stream roundtrip", async () => {
    const s = new LocalScanStorage();
    const userId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const scanId = "bbbbbbbb-bbbb-4ccc-dddd-ffffffffffff";
    const buf = Buffer.from("hello-object");
    const { storageKey, storageProvider } = await s.saveUpload({
      userId,
      scanId,
      buffer: buf,
      originalName: "test.txt",
      contentType: "text/plain"
    });
    assert.equal(storageProvider, "local");
    assert.ok(storageKey.includes(`scans/users/${userId}/${scanId}/original/`));

    const info = await s.getObjectInfo(storageKey);
    assert.equal(info.exists, true);
    assert.equal(info.size, buf.length);

    const stream = await s.getDownloadStream(storageKey);
    const chunks = [];
    for await (const c of stream) {
      chunks.push(c);
    }
    assert.equal(Buffer.concat(chunks).toString("utf8"), "hello-object");
  });

  it("getDownloadStream with byte range reads slice only", async () => {
    const s = new LocalScanStorage();
    const userId = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
    const scanId = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
    const buf = Buffer.from("0123456789");
    const { storageKey } = await s.saveUpload({
      userId,
      scanId,
      buffer: buf,
      originalName: "slice.bin",
      contentType: "application/octet-stream"
    });
    const stream = await s.getDownloadStream(storageKey, { start: 3, end: 6 });
    const chunks = [];
    for await (const c of stream) {
      chunks.push(c);
    }
    assert.equal(Buffer.concat(chunks).toString("utf8"), "3456");
  });

  it("saveDerivedAsset writes structured derived key", async () => {
    const s = new LocalScanStorage();
    const userId = "11111111-1111-4111-8111-111111111111";
    const scanId = "22222222-2222-4222-8222-222222222222";
    const { storageKey } = await s.saveDerivedAsset({
      userId,
      scanId,
      assetName: "hm_test.png",
      buffer: Buffer.from("png-bytes"),
      contentType: "image/png"
    });
    assert.ok(storageKey.includes("/derived/hm_test.png"));
    const info = await s.getObjectInfo(storageKey);
    assert.equal(info.exists, true);
    assert.equal(info.size, 9);
  });
});
