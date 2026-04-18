const fs = require("fs/promises");
const path = require("path");
const { parseJsonBodyOrThrow, throwIfHttpError } = require("./realProviderResponse");
const {
  ConfigurationError,
  UnsupportedInputError,
  FileMissingError,
  FileTooLargeError,
  EmptyFileError,
  ProviderBadResponseError,
  ProviderTimeoutError,
  TemporaryProviderError
} = require("./realProviderErrors");

const LOG = "[reality-defender]";

function rdLog(payload) {
  console.info(`${LOG} ${JSON.stringify(payload)}`);
}

/** @see @realitydefender/realitydefender SDK `DEFAULT_BASE_URL` */
const DEFAULT_BASE_URL = "https://api.prd.realitydefender.xyz";

const SIGNED_URL_PATH = "/api/files/aws-presigned";
const MEDIA_RESULT_PREFIX = "/api/media/users";

/** Image MIME allowlist (MVP); HEIC/HEIF common on Samsung Galaxy and iPhone. */
const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif"
]);

/** @see SUPPORTED_FILE_TYPES image row in Reality Defender TS SDK */
const MAX_IMAGE_BYTES = 52_428_800;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimBaseUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return DEFAULT_BASE_URL;
  return s.replace(/\/+$/, "");
}

function joinUrl(base, p) {
  const b = trimBaseUrl(base);
  const pathPart = p.startsWith("/") ? p : `/${p}`;
  return `${b}${pathPart}`;
}

/**
 * @param {string} raw
 */
function normalizeVendor(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

/**
 * @returns {{ apiKey: string; baseUrl: string; perRequestTimeoutMs: number; pollIntervalMs: number; pollTimeoutMs: number }}
 */
function loadConfig() {
  const apiKey = process.env.REALITY_DEFENDER_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigurationError(
      "REALITY_DEFENDER_API_KEY is not set (required for DETECTION_REAL_VENDOR=reality_defender).",
      {}
    );
  }

  let baseUrl = process.env.REALITY_DEFENDER_BASE_URL?.trim();
  if (baseUrl) {
    try {
      void new URL(baseUrl);
    } catch {
      throw new ConfigurationError("REALITY_DEFENDER_BASE_URL is not a valid URL.", { snippet: baseUrl });
    }
  } else {
    baseUrl = DEFAULT_BASE_URL;
  }

  const perRequestTimeoutMs = Math.min(
    Math.max(Number.parseInt(process.env.DETECTION_REAL_TIMEOUT_MS || "120000", 10) || 120000, 1000),
    600000
  );

  const pollIntervalMs = Math.min(
    Math.max(Number.parseInt(process.env.REALITY_DEFENDER_POLL_INTERVAL_MS || "5000", 10) || 5000, 1),
    120_000
  );

  const pollTimeoutMs = Math.min(
    Math.max(Number.parseInt(process.env.REALITY_DEFENDER_POLL_TIMEOUT_MS || "300000", 10) || 300000, 5000),
    3_600_000
  );

  return { apiKey, baseUrl, perRequestTimeoutMs, pollIntervalMs, pollTimeoutMs };
}

/**
 * @param {import('../contract').ProviderInput} input
 */
function assertSupportedInput(input) {
  if (input.sourceType === "url") {
    throw new UnsupportedInputError(
      "Reality Defender integration (MVP) does not support URL scans; use an upload scan or DETECTION_PROVIDER=mock.",
      { snippet: input.scanId }
    );
  }
  if (input.sourceType !== "upload") {
    throw new UnsupportedInputError(`Unsupported sourceType for Reality Defender: ${input.sourceType}`, {
      snippet: input.scanId
    });
  }
  if (input.legacyMetadataOnly || !input.localPath) {
    throw new UnsupportedInputError(
      "Reality Defender integration requires a persisted upload file (localPath). Legacy metadata-only rows are not supported.",
      { snippet: input.scanId }
    );
  }
  const mime = String(input.mimeType || "")
    .trim()
    .toLowerCase();
  if (!IMAGE_MIME.has(mime)) {
    throw new UnsupportedInputError(
      `Unsupported MIME type for Reality Defender MVP: ${input.mimeType}. Allowed: ${[...IMAGE_MIME].join(", ")}`,
      { snippet: input.scanId }
    );
  }
}

async function fetchWithDeadline(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {unknown} json
 * @param {number} httpStatus
 * @returns {{ signedUrl: string; requestId: string; mediaId: string }}
 */
function parsePresignResponse(json, httpStatus) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new ProviderBadResponseError("Reality Defender presign response must be a JSON object", {
      httpStatus,
      snippet: "non-object"
    });
  }
  const o = /** @type {Record<string, unknown>} */ (json);
  const errno = o.errno;
  if (typeof errno === "number" && errno !== 0) {
    throw new ProviderBadResponseError(`Reality Defender presign failed (errno=${errno})`, {
      httpStatus,
      snippet: typeof o.response === "string" ? o.response.slice(0, 200) : ""
    });
  }
  const inner = o.response;
  const signedUrl =
    inner && typeof inner === "object" && !Array.isArray(inner) && typeof inner.signedUrl === "string"
      ? inner.signedUrl
      : null;
  const requestId = typeof o.requestId === "string" ? o.requestId : null;
  const mediaId = typeof o.mediaId === "string" ? o.mediaId : null;
  if (!signedUrl || !requestId) {
    throw new ProviderBadResponseError(
      "Reality Defender presign response missing response.signedUrl or requestId",
      { httpStatus, snippet: JSON.stringify(Object.keys(o)).slice(0, 200) }
    );
  }
  return { signedUrl, requestId, mediaId: mediaId || "" };
}

/**
 * Map RD media JSON → provider return shape (before global normalize).
 * Aligns with SDK `formatResult` in realitydefender-sdk-typescript (`src/detection/results.ts`).
 *
 * @param {Record<string, unknown>} media
 */
function mapMediaToProviderFields(media) {
  const rs = media.resultsSummary;
  if (!rs || typeof rs !== "object" || Array.isArray(rs)) {
    throw new ProviderBadResponseError("Reality Defender media response missing resultsSummary", {
      snippet: "no-resultsSummary"
    });
  }
  const rsRec = /** @type {Record<string, unknown>} */ (rs);
  const rawStatus = typeof rsRec.status === "string" ? rsRec.status : "";
  const statusNorm = rawStatus === "FAKE" ? "MANIPULATED" : rawStatus;

  const meta = rsRec.metadata && typeof rsRec.metadata === "object" && !Array.isArray(rsRec.metadata)
    ? /** @type {Record<string, unknown>} */ (rsRec.metadata)
    : {};
  const finalScore = meta.finalScore;
  let confidence = null;
  if (typeof finalScore === "number" && Number.isFinite(finalScore)) {
    confidence = Math.max(0, Math.min(100, Number(finalScore.toFixed(2))));
  }

  const upper = statusNorm.toUpperCase();
  /** @type {boolean | null} */
  let isAiGenerated;
  if (upper === "MANIPULATED" || upper === "FAKE") {
    isAiGenerated = true;
  } else if (upper === "AUTHENTIC") {
    isAiGenerated = false;
  } else if (
    upper === "SUSPICIOUS" ||
    upper === "NOT_APPLICABLE" ||
    upper === "UNABLE_TO_EVALUATE" ||
    upper === "ANALYZING" ||
    !upper
  ) {
    isAiGenerated = null;
  } else {
    isAiGenerated = null;
  }

  if (confidence == null) {
    if (isAiGenerated === true) confidence = 85;
    else if (isAiGenerated === false) confidence = 15;
    else confidence = 50;
  }

  const summary =
    isAiGenerated === true
      ? `Reality Defender: ${statusNorm} — likely manipulated or AI-generated.`
      : isAiGenerated === false
        ? `Reality Defender: ${statusNorm} — consistent with authentic capture.`
        : `Reality Defender: ${statusNorm || "UNKNOWN"} — inconclusive; see details.`;

  const models = Array.isArray(media.models) ? media.models : [];
  const modelSummaries = models.slice(0, 8).map((m) => {
    if (!m || typeof m !== "object") return { name: "?", status: "?" };
    const mo = /** @type {Record<string, unknown>} */ (m);
    return {
      name: typeof mo.name === "string" ? mo.name : "?",
      status: typeof mo.status === "string" ? mo.status : "?",
      predictionNumber: typeof mo.predictionNumber === "number" ? mo.predictionNumber : null
    };
  });

  return {
    confidence,
    isAiGenerated,
    summary,
    details: {
      detectionVendor: "reality_defender",
      requestId: typeof media.requestId === "string" ? media.requestId : undefined,
      mediaType: typeof media.mediaType === "string" ? media.mediaType : undefined,
      overallStatus: typeof media.overallStatus === "string" ? media.overallStatus : undefined,
      resultsSummaryStatus: statusNorm || rawStatus || null,
      finalScore: typeof finalScore === "number" ? finalScore : null,
      modelsSample: modelSummaries
    }
  };
}

/**
 * @param {import('../contract').ProviderInput} input
 */
async function detectRealityDefender(input) {
  assertSupportedInput(input);
  const cfg = loadConfig();
  const localPath = /** @type {string} */ (input.localPath);
  const started = Date.now();

  rdLog({
    event: "reality_defender_selected",
    scanId: input.scanId,
    baseUrlHost: (() => {
      try {
        return new URL(trimBaseUrl(cfg.baseUrl)).host;
      } catch {
        return "";
      }
    })()
  });

  let stat;
  try {
    stat = await fs.stat(localPath);
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === "ENOENT") {
      throw new FileMissingError("Local media file is missing before Reality Defender upload.", {
        snippet: path.basename(localPath)
      });
    }
    throw new ConfigurationError(`Cannot stat local file: ${e.message}`, { snippet: path.basename(localPath) });
  }
  if (!stat.isFile()) {
    throw new FileMissingError("Local path is not a regular file.", { snippet: path.basename(localPath) });
  }
  if (stat.size === 0) {
    throw new EmptyFileError("Local media file is empty.", { snippet: path.basename(localPath) });
  }
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new FileTooLargeError(
      `File exceeds Reality Defender image limit (${stat.size} > ${MAX_IMAGE_BYTES} bytes)`,
      { snippet: String(stat.size) }
    );
  }

  const fileBuf = await fs.readFile(localPath);
  if (fileBuf.length !== stat.size) {
    throw new FileMissingError("Read size mismatch after stat; aborting Reality Defender upload.", {
      snippet: path.basename(localPath)
    });
  }

  const fileName = input.originalFilename || path.basename(localPath) || "upload.jpg";
  const presignUrl = joinUrl(cfg.baseUrl, SIGNED_URL_PATH);

  rdLog({
    event: "reality_defender_presign_start",
    scanId: input.scanId,
    fileName
  });

  let presignRes;
  try {
    presignRes = await fetchWithDeadline(
      presignUrl,
      {
        method: "POST",
        headers: {
          "X-API-KEY": cfg.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fileName })
      },
      cfg.perRequestTimeoutMs
    );
  } catch (e) {
    if (e && /** @type {Error} */ (e).name === "AbortError") {
      throw new ProviderTimeoutError(`Reality Defender presign timed out after ${cfg.perRequestTimeoutMs}ms`, {
        snippet: "presign"
      });
    }
    throw new TemporaryProviderError(`Reality Defender presign network error: ${e.message}`, { snippet: "presign" });
  }

  const presignText = await presignRes.text();
  try {
    throwIfHttpError(presignRes, presignText);
  } catch (err) {
    throw err;
  }
  const presignJson = parseJsonBodyOrThrow(presignText, presignRes.status);
  const { signedUrl, requestId, mediaId } = parsePresignResponse(presignJson, presignRes.status);

  rdLog({
    event: "reality_defender_upload_start",
    scanId: input.scanId,
    requestId,
    mediaId: mediaId || undefined,
    bytes: fileBuf.length
  });

  let putRes;
  try {
    putRes = await fetchWithDeadline(
      signedUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: fileBuf
      },
      cfg.perRequestTimeoutMs
    );
  } catch (e) {
    if (e && /** @type {Error} */ (e).name === "AbortError") {
      throw new ProviderTimeoutError(`Reality Defender S3 upload timed out after ${cfg.perRequestTimeoutMs}ms`, {
        snippet: "put"
      });
    }
    throw new TemporaryProviderError(`Reality Defender upload network error: ${e.message}`, { snippet: "put" });
  }
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => "");
    throw new ProviderBadResponseError(`Reality Defender file upload failed (HTTP ${putRes.status})`, {
      httpStatus: putRes.status,
      snippet: t.replace(/\s+/g, " ").trim().slice(0, 200)
    });
  }

  const deadline = Date.now() + cfg.pollTimeoutMs;
  const detailUrl = joinUrl(cfg.baseUrl, `${MEDIA_RESULT_PREFIX}/${encodeURIComponent(requestId)}`);

  rdLog({
    event: "reality_defender_poll_start",
    scanId: input.scanId,
    requestId,
    pollIntervalMs: cfg.pollIntervalMs,
    pollTimeoutMs: cfg.pollTimeoutMs
  });

  /** @type {Record<string, unknown> | null} */
  let lastMedia = null;

  while (Date.now() < deadline) {
    let mediaRes;
    try {
      mediaRes = await fetchWithDeadline(
        detailUrl,
        {
          method: "GET",
          headers: {
            "X-API-KEY": cfg.apiKey,
            "Content-Type": "application/json"
          }
        },
        cfg.perRequestTimeoutMs
      );
    } catch (e) {
      if (e && /** @type {Error} */ (e).name === "AbortError") {
        throw new ProviderTimeoutError(`Reality Defender poll request timed out after ${cfg.perRequestTimeoutMs}ms`, {
          snippet: "poll"
        });
      }
      throw new TemporaryProviderError(`Reality Defender poll network error: ${e.message}`, { snippet: "poll" });
    }

    const mediaText = await mediaRes.text();
    try {
      throwIfHttpError(mediaRes, mediaText);
    } catch (err) {
      throw err;
    }

    const mediaJson = parseJsonBodyOrThrow(mediaText, mediaRes.status);
    if (!mediaJson || typeof mediaJson !== "object" || Array.isArray(mediaJson)) {
      throw new ProviderBadResponseError("Reality Defender media detail must be a JSON object", {
        httpStatus: mediaRes.status,
        snippet: "non-object"
      });
    }
    lastMedia = /** @type {Record<string, unknown>} */ (mediaJson);

    const rsRaw = lastMedia.resultsSummary;
    if (rsRaw !== undefined && rsRaw !== null && (typeof rsRaw !== "object" || Array.isArray(rsRaw))) {
      throw new ProviderBadResponseError(
        "Reality Defender media response has invalid resultsSummary (expected object or null)",
        { httpStatus: mediaRes.status, snippet: typeof rsRaw }
      );
    }

    const rs = rsRaw && typeof rsRaw === "object" && !Array.isArray(rsRaw) ? /** @type {Record<string, unknown>} */ (rsRaw) : null;
    const status =
      rs && typeof rs.status === "string"
        ? String(rs.status)
        : "";

    if (rs && status && status.toUpperCase() !== "ANALYZING") {
      const mapped = mapMediaToProviderFields(lastMedia);
      const durationMs = Date.now() - started;
      rdLog({
        event: "reality_defender_poll_success",
        scanId: input.scanId,
        requestId,
        resultsSummaryStatus: mapped.details.resultsSummaryStatus,
        durationMs,
        retryable: false
      });
      return {
        providerId: "real",
        confidence: mapped.confidence,
        isAiGenerated: mapped.isAiGenerated,
        summary: mapped.summary,
        details: {
          ...mapped.details,
          mediaId: mediaId || undefined,
          timedOut: false,
          durationMs,
          httpStatus: mediaRes.status
        }
      };
    }

    if (Date.now() + cfg.pollIntervalMs >= deadline) {
      break;
    }
    await delay(cfg.pollIntervalMs);
  }

  rdLog({
    event: "reality_defender_poll_timeout",
    scanId: input.scanId,
    requestId,
    lastStatus:
      lastMedia &&
      lastMedia.resultsSummary &&
      typeof lastMedia.resultsSummary === "object" &&
      !Array.isArray(lastMedia.resultsSummary) &&
      typeof /** @type {Record<string, unknown>} */ (lastMedia.resultsSummary).status === "string"
        ? /** @type {Record<string, unknown>} */ (lastMedia.resultsSummary).status
        : null,
    retryable: true
  });

  throw new ProviderTimeoutError(
    `Reality Defender analysis did not finish within ${cfg.pollTimeoutMs}ms (requestId=${requestId})`,
    { snippet: "poll_timeout" }
  );
}

module.exports = {
  detectRealityDefender,
  normalizeVendor,
  trimBaseUrl,
  DEFAULT_BASE_URL,
  mapMediaToProviderFields,
  parsePresignResponse,
  MAX_IMAGE_BYTES,
  IMAGE_MIME
};
