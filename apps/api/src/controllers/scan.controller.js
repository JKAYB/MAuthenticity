const {
  createScanFromUpload,
  createScanFromUrl,
  getScanById,
  getScanHistory
} = require("../services/scan.service");
const {
  getScanActivityAnalytics,
  getDetectionMixAnalytics
} = require("../services/scanAnalytics.service");

const MAX_URL_LEN = 2048;

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

    return res.json(scan);
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
  scanHistory,
  scanAnalyticsActivity,
  scanAnalyticsDetectionMix
};
