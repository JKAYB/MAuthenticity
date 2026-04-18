const path = require("path");
const multer = require("multer");

const allowedMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime"
]);

/**
 * Galaxy / iOS often use HEIC; some clients send `application/octet-stream` or a generic type.
 * Normalize from filename so DB + worker see a proper image MIME.
 * @param {{ mimetype: string; originalname?: string }} file
 */
function normalizeHeicMimeFromFilename(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".heif") {
    file.mimetype = "image/heif";
  } else if (ext === ".heic") {
    file.mimetype = "image/heic";
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimes.has(file.mimetype)) {
      normalizeHeicMimeFromFilename(file);
    }
    if (!allowedMimes.has(file.mimetype)) {
      cb(new Error("Unsupported file type"));
      return;
    }
    cb(null, true);
  }
});

function normalizeUploadError(error, _req, _res, next) {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    error.status = 413;
    error.message = "File too large. Max size is 20MB";
    return next(error);
  }

  if (error.message === "Unsupported file type") {
    error.status = 400;
    return next(error);
  }

  return next(error);
}

module.exports = { upload, normalizeUploadError };
