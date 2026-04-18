#!/usr/bin/env node
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../.env")
});

const { describeObjectStorageReadiness } = require("./validation");
const { createScanObjectStorageFromEnv } = require("./factory");

const r = describeObjectStorageReadiness();
const line = { ...r };
if (r.ok) {
  try {
    const s = createScanObjectStorageFromEnv();
    line.storageProviderId = s.providerId;
  } catch (e) {
    line.ok = false;
    line.issues.push(e.message || String(e));
  }
}
console.log(JSON.stringify(line, null, 2));
process.exit(r.ok ? 0 : 1);
