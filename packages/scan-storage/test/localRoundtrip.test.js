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
    const scanId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const buf = Buffer.from("hello-object");
    const { storageKey, storageProvider } = await s.saveUpload({
      scanId,
      buffer: buf,
      originalName: "test.txt",
      contentType: "text/plain"
    });
    assert.equal(storageProvider, "local");
    assert.match(storageKey, new RegExp(`^${scanId}/`));

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
});
