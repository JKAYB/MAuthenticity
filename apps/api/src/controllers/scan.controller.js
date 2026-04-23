const {
  createScanFromUpload,
  createScanFromUrl,
  getScanById,
  getScanHistory,
  getScanAttemptsByGroup,
  getScanMediaForUser,
  getScanHeatmapAssetForUser,
  getScanArtifactForUser,
  retryFailedScanForUser,
} = require("../services/scan.service");
const {
  formatScanRowForClient,
} = require("../services/scanDetailHeatmap.service");
const {
  getScanActivityAnalytics,
  getDetectionMixAnalytics,
} = require("../services/scanAnalytics.service");
const { canRetry } = require("../services/retryPolicy.service");
const { providerById } = require("../config/scanProviders");

const MAX_URL_LEN = 2048;
const {
  buildContentDisposition,
  wantsAttachmentDownload,
} = require("../utils/contentDisposition.util");
const { MEDIA_TYPE_VALUES } = require("../utils/mediaType.util");

const RESULT_FILTER_VALUES = [
  "authentic",
  "manipulated",
  "suspicious",
  "analyzing",
  "failed",
];
const {
  enabledScanProviders,
  parseRequestedProviderIds,
} = require("../config/scanProviders");

function parsePagination(query) {
  const page = Number.parseInt(query.page, 10);
  const limit = Number.parseInt(query.limit, 10);

  return {
    page: Number.isNaN(page) || page < 1 ? 1 : page,
    limit: Number.isNaN(limit) || limit < 1 ? 10 : Math.min(limit, 100),
  };
}

/** Normalize `?result=` (Express may give a string[] for duplicate keys). */
function parseHistoryResultQuery(query) {
  const raw = query && query.result;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return "";
  return first.trim().toLowerCase();
}

function parseScanUrl(body) {
  const url = body && typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return { ok: false, error: "url is required" };
  }
  if (url.length > MAX_URL_LEN) {
    return { ok: false, error: `url exceeds ${MAX_URL_LEN} characters` };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "url must be a valid http(s) URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "url must use http or https" };
  }
  return { ok: true, url: parsed.toString() };
}

function normalizeProviderStatuses(scan) {
  const selected = Array.isArray(scan && scan.selected_providers)
    ? scan.selected_providers
        .map((v) =>
          String(v || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
  const byId =
    scan && scan.provider_statuses && typeof scan.provider_statuses === "object"
      ? scan.provider_statuses
      : {};
  return selected.map((id) => {
    const raw = String(byId[id] || "")
      .trim()
      .toLowerCase();
    const status =
      raw === "processing" ||
      raw === "completed" ||
      raw === "failed" ||
      raw === "queued"
        ? raw
        : "queued";
    const config = providerById(id);
    return {
      id,
      name: config && config.name ? config.name : id,
      status,
    };
  });
}

async function submitScanUpload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const requestedProviderIds = parseRequestedProviderIds(
      req.body && req.body.providers,
    );
    const scan = await createScanFromUpload({
      userId: req.user.id,
      file: req.file,
      requestedProviderIds,
    });
    const statusCode = scan.status === "pending" ? 202 : 200;
    return res.status(statusCode).json(scan);
  } catch (error) {
    return next(error);
  }
}

async function submitScanUrl(req, res, next) {
  try {
    const parsed = parseScanUrl(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const requestedProviderIds = parseRequestedProviderIds(
      req.body && req.body.providers,
    );
    const scan = await createScanFromUrl({
      userId: req.user.id,
      url: parsed.url,
      requestedProviderIds,
    });
    const statusCode = scan.status === "pending" ? 202 : 200;
    return res.status(statusCode).json(scan);
  } catch (error) {
    return next(error);
  }
}

async function listScanProviders(_req, res, next) {
  try {
    return res.json({ data: enabledScanProviders() });
  } catch (error) {
    return next(error);
  }
}

async function getScanResult(req, res, next) {
  try {
    const scan = await getScanById({
      scanId: req.params.id,
      userId: req.user.id,
    });
    if (!scan) {
      return res.status(404).json({ error: "Scan not found" });
    }

    const {
      row,
      heatmaps_expired,
      artifact_aggregation_available,
      artifact_model_metadata_available,
    } = formatScanRowForClient(scan);
    const groupId = scan.scan_group_id || scan.id;
    const attempts = await getScanAttemptsByGroup({
      userId: req.user.id,
      scanGroupId: groupId,
    });
    return res.json({
      ...row,
      scan_group_id: scan.scan_group_id || scan.id,
      retry_of_scan_id: scan.retry_of_scan_id || null,
      attempt_number: Number(scan.attempt_number || 1),
      retry_count: Number(scan.retry_count || 0),
      last_error: scan.last_error || null,
      error_payload: scan.error_payload || null,
      provider_execution: normalizeProviderStatuses(scan),
      attempts: attempts.map((a) => ({
        id: a.id,
        status: a.status,
        attempt_number: Number(a.attempt_number || 1),
        created_at: a.created_at,
        completed_at: a.completed_at || null,
        retry_of_scan_id: a.retry_of_scan_id || null,
      })),
      ...(heatmaps_expired ? { heatmaps_expired: true } : {}),
      ...(artifact_aggregation_available
        ? { artifact_aggregation_available: true }
        : {}),
      ...(artifact_model_metadata_available
        ? { artifact_model_metadata_available: true }
        : {}),
    });
  } catch (error) {
    return next(error);
  }
}

async function retryScan(req, res, next) {
  try {
    const existing = await getScanById({
      scanId: req.params.id,
      userId: req.user.id,
    });
    if (!existing) {
      return res.status(404).json({ error: "Scan not found" });
    }
    const policy = canRetry(req.user, existing);
    if (!policy.ok) {
      return res
        .status(409)
        .json({ error: policy.reason || "Scan cannot be retried" });
    }

    const retryProviders = Array.isArray(req.body && req.body.retryProviders)
      ? req.body.retryProviders
          .map((v) =>
            String(v || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : undefined;
    const retried = await retryFailedScanForUser({
      scanId: req.params.id,
      userId: req.user.id,
      retryProviders,
    });
    if (!retried.ok) {
      if (retried.reason === "not_found") {
        return res
          .status(404)
          .json({ error: retried.message || "Scan not found" });
      }
      if (retried.reason === "not_retryable" || retried.reason === "no_media") {
        return res
          .status(409)
          .json({ error: retried.message || "Scan cannot be retried" });
      }
      return res
        .status(400)
        .json({ error: retried.message || "Scan retry failed" });
    }

    return res.status(202).json({
      ok: true,
      scan: {
        id: retried.scan.id,
        status: retried.scan.status,
        retryOfScanId: retried.scan.retry_of_scan_id,
        scanGroupId: retried.scan.scan_group_id,
        attemptNumber: retried.scan.attempt_number,
        retryCount: retried.scan.retry_count,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function streamScanArtifact(req, res, next) {
  try {
    const type = String(req.params.type || "")
      .trim()
      .toLowerCase();
    const result = await getScanArtifactForUser({
      scanId: req.params.id,
      userId: req.user.id,
      type,
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return res.status(404).json({ error: "Artifact not found" });
      }
      if (result.reason === "bad_type") {
        return res.status(400).json({ error: "Invalid artifact type" });
      }
      if (result.reason === "no_media") {
        return res.status(404).json({ error: "Artifact object missing" });
      }
      return res
        .status(500)
        .json({ error: result.message || "Failed to read artifact" });
    }

    res.status(200);
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Length", String(result.contentLength));
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition("inline", result.downloadName || "artifact.json"),
    );

    result.stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "Stream error" });
      } else {
        res.destroy(err);
      }
    });

    result.stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

async function streamScanHeatmap(req, res, next) {
  try {
    const result = await getScanHeatmapAssetForUser({
      scanId: req.params.id,
      userId: req.user.id,
      assetName: req.params.asset,
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return res.status(404).json({ error: "Heatmap not found" });
      }
      if (result.reason === "no_media") {
        return res.status(404).json({ error: "Heatmap object missing" });
      }
      return res
        .status(500)
        .json({ error: result.message || "Failed to read heatmap" });
    }

    res.status(200);
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Length", String(result.contentLength));

    result.stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "Stream error" });
      } else {
        res.destroy(err);
      }
    });

    result.stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

async function streamScanMedia(req, res, next) {
  try {
    const rangeHeader = req.get("Range");
    const attachment = wantsAttachmentDownload(req.query && req.query.download);
    const result = await getScanMediaForUser({
      scanId: req.params.id,
      userId: req.user.id,
      rangeHeader,
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return res.status(404).json({ error: "Scan not found" });
      }
      if (result.reason === "no_media") {
        return res
          .status(404)
          .json({ error: "No uploaded media for this scan" });
      }
      if (result.reason === "too_large") {
        return res
          .status(413)
          .json({ error: "Media preview is too large to stream" });
      }
      if (result.reason === "range_not_satisfiable") {
        const ts = result.totalSize != null ? result.totalSize : 0;
        res.setHeader("Content-Range", `bytes */${ts}`);
        return res.status(416).end();
      }
      return res
        .status(500)
        .json({ error: result.message || "Failed to read media" });
    }

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition(
        attachment ? "attachment" : "inline",
        result.filename,
      ),
    );
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", String(result.contentLength));
    if (result.isPartial) {
      res.setHeader(
        "Content-Range",
        `bytes ${result.rangeStart}-${result.rangeEnd}/${result.totalSize}`,
      );
    }

    res.status(result.httpStatus);

    result.stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "Stream error" });
      } else {
        res.destroy(err);
      }
    });

    result.stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

async function scanHistory(req, res, next) {
  try {
    const { page, limit } = parsePagination(req.query);
    const mediaTypeRaw =
      req.query && typeof req.query.mediaType === "string"
        ? String(req.query.mediaType).trim().toLowerCase()
        : "";
    if (mediaTypeRaw && !MEDIA_TYPE_VALUES.includes(mediaTypeRaw)) {
      return res.status(400).json({ error: "Invalid mediaType filter" });
    }
    const resultRaw = parseHistoryResultQuery(req.query);
    const q =
      req.query && typeof req.query.q === "string"
        ? String(req.query.q).trim()
        : "";
    if (resultRaw && !RESULT_FILTER_VALUES.includes(resultRaw)) {
      return res.status(400).json({ error: "Invalid result filter" });
    }
    const history = await getScanHistory({
      userId: req.user.id,
      page,
      limit,
      mediaType: mediaTypeRaw || undefined,
      result: resultRaw || undefined,
      q: q || undefined,
    });
    return res.json(history);
  } catch (error) {
    return next(error);
  }
}

async function scanAnalyticsActivity(req, res, next) {
  try {
    const result = await getScanActivityAnalytics({
      userId: req.user.id,
      range: req.query.range,
      groupBy: req.query.groupBy,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function scanAnalyticsDetectionMix(req, res, next) {
  try {
    const result = await getDetectionMixAnalytics({
      userId: req.user.id,
      range: req.query.range,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  submitScanUpload,
  submitScanUrl,
  listScanProviders,
  getScanResult,
  streamScanArtifact,
  streamScanHeatmap,
  streamScanMedia,
  retryScan,
  scanHistory,
  scanAnalyticsActivity,
  scanAnalyticsDetectionMix,
};
