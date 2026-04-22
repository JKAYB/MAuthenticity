"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzePresignedHeatmapUrl,
  parseAmzDateToUtcMs,
  isVendorPresignedUrlExpiredOrNear
} = require("../src/presignedUrlInspect");

test("parseAmzDateToUtcMs parses SigV4 date", () => {
  const ms = parseAmzDateToUtcMs("20250418T153000Z");
  assert.equal(ms, Date.UTC(2025, 3, 18, 15, 30, 0));
});

test("analyzePresignedHeatmapUrl computes expiry from X-Amz-Date + X-Amz-Expires", () => {
  const u =
    "https://example.s3.amazonaws.com/obj?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=x&X-Amz-Date=20250418T000000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host&X-Amz-Signature=abc";
  const a = analyzePresignedHeatmapUrl(u);
  assert.equal(a.hasXAmzDate, true);
  assert.equal(a.hasXAmzExpires, true);
  assert.equal(a.expiresInSec, 900);
  assert.ok(a.expiresAtMs && a.signedAtIso);
});

test("isVendorPresignedUrlExpiredOrNear respects skew", () => {
  const far =
    "https://ex.test/b?X-Amz-Date=20990101T000000Z&X-Amz-Expires=86400&X-Amz-Signature=1";
  assert.equal(isVendorPresignedUrlExpiredOrNear(far, 120), false);
});
