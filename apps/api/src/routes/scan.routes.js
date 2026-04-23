const express = require("express");
const {
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
  scanAnalyticsDetectionMix
} = require("../controllers/scan.controller");
const { authMiddleware, requireUser } = require("../middleware/auth.middleware");
const { apiKeyMiddleware } = require("../middleware/apikey.middleware");
const { upload, normalizeUploadError } = require("../middleware/upload.middleware");

const router = express.Router();

router.use(authMiddleware);
router.use(apiKeyMiddleware);
router.use(requireUser);

function routeCreateScan(req, res, next) {
  if (req.is("application/json")) {
    return submitScanUrl(req, res, next);
  }
  return upload.single("file")(req, res, (err) => {
    if (err) {
      return next(err);
    }
    return submitScanUpload(req, res, next);
  });
}

router.post("/", routeCreateScan);
router.use(normalizeUploadError);
router.get("/providers", listScanProviders);
router.get("/analytics/activity", scanAnalyticsActivity);
router.get("/analytics/detection-mix", scanAnalyticsDetectionMix);
router.get("/history", scanHistory);
router.post("/:id/retry", retryScan);
router.get("/:id/media", streamScanMedia);
router.get("/:id/artifacts/:type", streamScanArtifact);
router.get("/:id/heatmaps/:asset", streamScanHeatmap);
router.get("/:id", getScanResult);

module.exports = router;
