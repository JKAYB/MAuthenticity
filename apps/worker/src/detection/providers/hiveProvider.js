"use strict";

const fs = require("fs/promises");

const HIVE_DEBUG_MEDIA_URL = "https://hivemoderation.com/images/31f7d53.png";

const SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/m4v",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav"
]);

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function toBool(v, fallback = false) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "1" || s === "true" || s === "yes";
}

function parseConfidenceFromResponse(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return 50;
  const j = json;
  const direct = Number(j.confidence ?? j.score ?? j.ai_score ?? j.probability);
  if (Number.isFinite(direct)) {
    const val = direct <= 1 ? direct * 100 : direct;
    return Math.max(0, Math.min(100, Number(val)));
  }
  return 50;
}

function parseIsAiFromResponse(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const j = json;
  if (typeof j.is_ai_generated === "boolean") return j.is_ai_generated;
  if (typeof j.isAiGenerated === "boolean") return j.isAiGenerated;
  const verdict = String(j.verdict || j.label || j.classification || "")
    .trim()
    .toLowerCase();
  if (!verdict) return null;
  if (["ai", "synthetic", "fake", "manipulated"].some((k) => verdict.includes(k))) return true;
  if (["real", "authentic", "genuine"].some((k) => verdict.includes(k))) return false;
  return null;
}

function buildSummary({ isAiGenerated, confidence }) {
  if (isAiGenerated === true) {
    return `Hive: likely synthetic/manipulated (${Math.round(confidence)}% confidence).`;
  }
  if (isAiGenerated === false) {
    return `Hive: likely authentic (${Math.round(confidence)}% confidence).`;
  }
  return `Hive: inconclusive result (${Math.round(confidence)}% confidence).`;
}

function normalizeMime(mime) {
  const raw = String(mime || "")
    .trim()
    .toLowerCase();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw === "audio/x-wav") return "audio/wav";
  return raw;
}

function makeDataUrlBase64(mime, base64) {
  return `data:${mime};base64,${base64}`;
}

async function parseHiveJsonResponse(res) {
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { text, json };
}

async function runHiveMediaUrlProbe({ url, apiKey, timeoutMs, scanId }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const probePayload = {
      media_metadata: true,
      input: [{ media_url: HIVE_DEBUG_MEDIA_URL }]
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(probePayload),
      signal: controller.signal
    });
    const { text } = await parseHiveJsonResponse(res);
    console.info(
      `[hive-provider] scan=${scanId} probe=media_url status=${res.status} ok=${String(res.ok)} body=${text.slice(0, 200)}`
    );
  } catch (err) {
    console.warn(
      `[hive-provider] scan=${scanId} probe=media_url failed message=${err && err.message ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

const hiveProvider = {
  id: "hive",

  /**
   * @param {import('../contract').ProviderInput} input
   */
  async detect(input) {
    const url = env("HIVE_API_URL");
    const apiKey = env("HIVE_API_KEY");
    const timeoutMs = Math.max(1000, Number.parseInt(env("HIVE_API_TIMEOUT_MS", "120000"), 10) || 120000);
    if (!url || !apiKey) {
      throw new Error("Hive is enabled but HIVE_API_URL or HIVE_API_KEY is missing");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const normalizedMime = normalizeMime(input.mimeType);
      let payloadMode = "media_url";
      /** @type {{ media_metadata: boolean; input: Array<{ media_base64?: string; media_url?: string }> }} */
      let payload = { media_metadata: true, input: [] };
      let base64Head = "";
      let bufferLen = 0;
      let hasBuffer = false;

      if (input.sourceType === "upload") {
        if (!input.localPath) {
          throw new Error("Hive upload input is missing localPath");
        }
        if (!SUPPORTED_MIME.has(normalizedMime)) {
          throw new Error(
            `Hive does not support MIME type "${normalizedMime || input.mimeType || "unknown"}"`
          );
        }
        const bytes = await fs.readFile(input.localPath);
        hasBuffer = Buffer.isBuffer(bytes);
        bufferLen = hasBuffer ? bytes.length : 0;
        if (!hasBuffer || bufferLen <= 0) {
          throw new Error("Hive upload buffer is missing or empty");
        }
        const base64 = bytes.toString("base64");
        base64Head = base64.slice(0, 50);
        payloadMode = "media_base64";
        payload = {
          media_metadata: true,
          input: [{ media_base64: makeDataUrlBase64(normalizedMime, base64) }]
        };
      } else {
        const mediaUrl = String(input.sourceUrl || "").trim();
        if (!mediaUrl) {
          throw new Error("Hive URL scan is missing sourceUrl");
        }
        payload = {
          media_metadata: true,
          input: [{ media_url: mediaUrl }]
        };
      }

      if (!Array.isArray(payload.input) || payload.input.length !== 1) {
        throw new Error("Hive payload must include exactly one input item");
      }

      console.info(
        `[hive-provider] scan=${input.scanId} file="${input.originalFilename || ""}" size=${Number(input.fileSizeBytes || 0)} mime="${input.mimeType || ""}" mime_normalized="${normalizedMime}" buffer_exists=${String(hasBuffer)} buffer_length=${bufferLen} base64_head="${base64Head}" payload_mode=${payloadMode}`
      );

      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const { text, json } = await parseHiveJsonResponse(res);
      if (!res.ok) {
        if (toBool(env("HIVE_DEBUG_MEDIA_URL_PROBE"), true)) {
          await runHiveMediaUrlProbe({ url, apiKey, timeoutMs, scanId: input.scanId });
        }
        const err = new Error(`Hive request failed (${res.status}): ${text.slice(0, 200)}`);
        err.statusCode = res.status;
        err.rawResponse = json && typeof json === "object" ? json : text.slice(0, 1000);
        throw err;
      }

      const confidence = parseConfidenceFromResponse(json);
      const isAiGenerated = parseIsAiFromResponse(json);
      return {
        providerId: "hive",
        confidence,
        isAiGenerated,
        summary: buildSummary({ isAiGenerated, confidence }),
        details: {
          detectionVendor: "hive",
          requestMode: payloadMode,
          mimeType: normalizedMime || null,
          upstream: json
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }
};

module.exports = { hiveProvider };
