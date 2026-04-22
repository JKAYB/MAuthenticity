const {
  createScanFromUpload,
  createScanFromUrl,
  getScanById,
  getScanHistory,
  getScanMediaForUser,
  getScanHeatmapAssetForUser,
  getScanArtifactForUser
} = require("../services/scan.service");
const { formatScanRowForClient } = require("../services/scanDetailHeatmap.service");
const {
  getScanActivityAnalytics,
  getDetectionMixAnalytics
} = require("../services/scanAnalytics.service");

const MAX_URL_LEN = 2048;
const {
  buildContentDisposition,
  wantsAttachmentDownload
} = require("../utils/contentDisposition.util");

function parsePagination(query) {
  const page = Number.parseInt(query.page, 10);
  const limit = Number.parseInt(query.limit, 10);

  return {
    page: Number.isNaN(page) || page < 1 ? 1 : page,
    limit: Number.isNaN(limit) || limit < 1 ? 10 : Math.min(limit, 100)
  };
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

async function submitScanUpload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const scan = await createScanFromUpload({ userId: req.user.id, file: req.file });
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

    const scan = await createScanFromUrl({ userId: req.user.id, url: parsed.url });
    const statusCode = scan.status === "pending" ? 202 : 200;
    return res.status(statusCode).json(scan);
  } catch (error) {
    return next(error);
  }
}

async function getScanResult(req, res, next) {
  try {
    const scan = await getScanById({ scanId: req.params.id, userId: req.user.id });
    if (!scan) {
      return res.status(404).json({ error: "Scan not found" });
    }

    const {
      row,
      heatmaps_expired,
      artifact_aggregation_available,
      artifact_model_metadata_available
    } = formatScanRowForClient(scan);
    return res.json({
      ...row,
      ...(heatmaps_expired ? { heatmaps_expired: true } : {}),
      ...(artifact_aggregation_available ? { artifact_aggregation_available: true } : {}),
      ...(artifact_model_metadata_available ? { artifact_model_metadata_available: true } : {})
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
      type
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
      return res.status(500).json({ error: result.message || "Failed to read artifact" });
    }

    res.status(200);
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Cache-Control", "private, max-age=120");
    res.setHeader("Content-Length", String(result.contentLength));
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition("inline", result.downloadName || "artifact.json")
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
      assetName: req.params.asset
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return res.status(404).json({ error: "Heatmap not found" });
      }
      if (result.reason === "no_media") {
        return res.status(404).json({ error: "Heatmap object missing" });
      }
      return res.status(500).json({ error: result.message || "Failed to read heatmap" });
    }

    res.status(200);
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Cache-Control", "private, max-age=120");
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
      rangeHeader
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return res.status(404).json({ error: "Scan not found" });
      }
      if (result.reason === "no_media") {
        return res.status(404).json({ error: "No uploaded media for this scan" });
      }
      if (result.reason === "too_large") {
        return res.status(413).json({ error: "Media preview is too large to stream" });
      }
      if (result.reason === "range_not_satisfiable") {
        const ts = result.totalSize != null ? result.totalSize : 0;
        res.setHeader("Content-Range", `bytes */${ts}`);
        return res.status(416).end();
      }
      return res.status(500).json({ error: result.message || "Failed to read media" });
    }

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Cache-Control", "private, max-age=120");
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition(attachment ? "attachment" : "inline", result.filename)
    );
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", String(result.contentLength));
    if (result.isPartial) {
      res.setHeader(
        "Content-Range",
        `bytes ${result.rangeStart}-${result.rangeEnd}/${result.totalSize}`
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
    const result = await getScanHistory({ userId: req.user.id, page, limit });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function scanAnalyticsActivity(req, res, next) {
  try {
    const result = await getScanActivityAnalytics({
      userId: req.user.id,
      range: req.query.range,
      groupBy: req.query.groupBy
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
      range: req.query.range
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  submitScanUpload,
  submitScanUrl,
  getScanResult,
  streamScanArtifact,
  streamScanHeatmap,
  streamScanMedia,
  scanHistory,
  scanAnalyticsActivity,
  scanAnalyticsDetectionMix
};
