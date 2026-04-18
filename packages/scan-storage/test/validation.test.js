"use strict";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { validateObjectStorageConfig } = require("../src/validation");

describe("object storage validation", () => {
  let prev;

  afterEach(() => {
    if (!prev) {
      return;
    }
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("rejects gcs provider", () => {
    prev = {
      OBJECT_STORAGE_PROVIDER: process.env.OBJECT_STORAGE_PROVIDER
    };
    process.env.OBJECT_STORAGE_PROVIDER = "gcs";
    assert.throws(() => validateObjectStorageConfig(), /not implemented/i);
  });

  it("requires s3 env when provider is s3", () => {
    prev = {
      OBJECT_STORAGE_PROVIDER: process.env.OBJECT_STORAGE_PROVIDER,
      OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET,
      OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION,
      OBJECT_STORAGE_ACCESS_KEY_ID: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
      OBJECT_STORAGE_SECRET_ACCESS_KEY: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY
    };
    process.env.OBJECT_STORAGE_PROVIDER = "s3";
    delete process.env.OBJECT_STORAGE_BUCKET;
    delete process.env.OBJECT_STORAGE_REGION;
    delete process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
    delete process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
    assert.throws(() => validateObjectStorageConfig(), /OBJECT_STORAGE_BUCKET/);
  });

  it("allows local with no s3 env", () => {
    prev = {
      OBJECT_STORAGE_PROVIDER: process.env.OBJECT_STORAGE_PROVIDER,
      OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET
    };
    process.env.OBJECT_STORAGE_PROVIDER = "local";
    delete process.env.OBJECT_STORAGE_BUCKET;
    assert.doesNotThrow(() => validateObjectStorageConfig());
  });
});
