"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { retryPolicy } = require("../src/config/retryPolicy");

describe("retryPolicy.canRetry", () => {
  it("returns allow shape for scan rows", () => {
    const result = retryPolicy.canRetry({ retry_count: 0 });
    assert.equal(typeof result.ok, "boolean");
    assert.equal(typeof result.retryCount, "number");
    assert.equal(typeof result.maxRetries, "number");
  });
});
