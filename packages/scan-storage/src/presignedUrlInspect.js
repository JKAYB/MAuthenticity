"use strict";

/**
 * Parse AWS SigV4 query-style presigned URL timing (X-Amz-Date + X-Amz-Expires).
 * Used to detect vendor heatmap URLs that are already expired before returning them from APIs.
 *
 * @param {string} urlString
 * @returns {{
 *   isPresignedStyle: boolean;
 *   hasXAmzDate: boolean;
 *   hasXAmzExpires: boolean;
 *   signedAtIso: string | null;
 *   expiresInSec: number | null;
 *   expiresAtMs: number | null;
 *   expiresAtIso: string | null;
 *   nowIso: string;
 *   expired: boolean | null;
 * }}
 */
function analyzePresignedHeatmapUrl(urlString) {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  if (!urlString || typeof urlString !== "string") {
    return {
      isPresignedStyle: false,
      hasXAmzDate: false,
      hasXAmzExpires: false,
      signedAtIso: null,
      expiresInSec: null,
      expiresAtMs: null,
      expiresAtIso: null,
      nowIso,
      expired: null
    };
  }

  try {
    const u = new URL(urlString);
    const q = u.searchParams;
    const xDate = q.get("X-Amz-Date") || q.get("x-amz-date");
    const xExpiresRaw = q.get("X-Amz-Expires") || q.get("x-amz-expires");
    const hasXAmzDate = Boolean(xDate);
    const hasXAmzExpires = Boolean(xExpiresRaw);
    const isPresignedStyle =
      hasXAmzDate ||
      q.has("X-Amz-Signature") ||
      q.has("X-Amz-Credential") ||
      q.has("AWSAccessKeyId");

    if (!hasXAmzDate || !xExpiresRaw) {
      return {
        isPresignedStyle,
        hasXAmzDate,
        hasXAmzExpires,
        signedAtIso: null,
        expiresInSec: null,
        expiresAtMs: null,
        expiresAtIso: null,
        nowIso,
        expired: null
      };
    }

    const expiresInSec = Number(xExpiresRaw);
    if (!Number.isFinite(expiresInSec) || expiresInSec < 0) {
      return {
        isPresignedStyle,
        hasXAmzDate,
        hasXAmzExpires: true,
        signedAtIso: null,
        expiresInSec: null,
        expiresAtMs: null,
        expiresAtIso: null,
        nowIso,
        expired: null
      };
    }

    const signedAtMs = parseAmzDateToUtcMs(xDate);
    if (signedAtMs == null) {
      return {
        isPresignedStyle,
        hasXAmzDate,
        hasXAmzExpires: true,
        signedAtIso: null,
        expiresInSec,
        expiresAtMs: null,
        expiresAtIso: null,
        nowIso,
        expired: null
      };
    }

    const expiresAtMs = signedAtMs + Math.trunc(expiresInSec) * 1000;
    const expiresAtIso = new Date(expiresAtMs).toISOString();
    const signedAtIso = new Date(signedAtMs).toISOString();

    return {
      isPresignedStyle,
      hasXAmzDate,
      hasXAmzExpires: true,
      signedAtIso,
      expiresInSec: Math.trunc(expiresInSec),
      expiresAtMs,
      expiresAtIso,
      nowIso,
      expired: expiresAtMs <= nowMs
    };
  } catch {
    return {
      isPresignedStyle: false,
      hasXAmzDate: false,
      hasXAmzExpires: false,
      signedAtIso: null,
      expiresInSec: null,
      expiresAtMs: null,
      expiresAtIso: null,
      nowIso,
      expired: null
    };
  }
}

/**
 * @param {string} xAmzDate e.g. 20250418T153000Z
 * @returns {number | null} epoch ms (UTC)
 */
function parseAmzDateToUtcMs(xAmzDate) {
  const s = String(xAmzDate || "").trim();
  if (!/^\d{8}T\d{6}Z$/i.test(s)) {
    return null;
  }
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const hh = Number(s.slice(9, 11));
  const mm = Number(s.slice(11, 13));
  const ss = Number(s.slice(13, 15));
  const t = Date.UTC(y, mo, d, hh, mm, ss);
  return Number.isFinite(t) ? t : null;
}

/**
 * True when URL is a parseable SigV4-style presign that expires within `skewSec` or is already expired.
 * @param {string} urlString
 * @param {number} [skewSec] default 120 — treat “about to expire” as unusable for durable API responses
 */
function isVendorPresignedUrlExpiredOrNear(urlString, skewSec = 120) {
  const a = analyzePresignedHeatmapUrl(urlString);
  if (a.expiresAtMs == null) {
    return false;
  }
  return a.expiresAtMs <= Date.now() + skewSec * 1000;
}

module.exports = {
  analyzePresignedHeatmapUrl,
  parseAmzDateToUtcMs,
  isVendorPresignedUrlExpiredOrNear
};
