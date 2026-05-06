const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/auth.routes");
const accessRoutes = require("./routes/access.routes");
const scanRoutes = require("./routes/scan.routes");
const scanAdminRoutes = require("./routes/scanAdmin.routes");
const { getMe, updateMe, changePassword, deleteMe } = require("./controllers/auth.controller");
const { authMiddleware, requireUser } = require("./middleware/auth.middleware");
const { internalOpsMiddleware } = require("./middleware/internalOps.middleware");
const { privateCacheNoStore } = require("./middleware/privateCache.middleware");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");
const { getScanExecutionMode } = require("./config/scanExecution");
const { configurePassport, passport } = require("./config/passport");

function createApp() {
  const app = express();
  const allowedOrigins = (
    process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174,https://mauthenticity.netlify.app"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const webAppUrl = String(process.env.WEB_APP_URL || "").trim();
  if (webAppUrl && !allowedOrigins.includes(webAppUrl)) {
    allowedOrigins.push(webAppUrl);
  }
  const loopbackOriginRe = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || loopbackOriginRe.test(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS blocked for this origin"));
      },
      credentials: true
    })
  );
  // Cookie auth is enabled; add CSRF protection middleware here before mutating routes if/when needed.
  app.use(cookieParser());
  app.use(express.json());
  configurePassport();
  app.use(passport.initialize());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  /** Liveness does not check dependencies; use `/ready` for DB (+ Redis when scans use the queue). */
  app.get("/ready", async (_req, res) => {
    const checks = { database: false, redis: false };
    try {
      const { pool } = require("./db/pool");
      await pool.query("SELECT 1");
      checks.database = true;
    } catch {
      /* ignore */
    }
    if (getScanExecutionMode() === "direct") {
      checks.redis = true;
      checks.redisSkipped = true;
    } else {
      try {
        const { connection: redisConnection } = require("./db/redis");
        const pong = await redisConnection.ping();
        checks.redis = pong === "PONG";
      } catch {
        /* ignore */
      }
    }
    const ok = checks.database && checks.redis;
    res.status(ok ? 200 : 503).json({ ok, ...checks });
  });

  app.get("/me", authMiddleware, requireUser, privateCacheNoStore, getMe);
  app.patch("/me", authMiddleware, requireUser, privateCacheNoStore, updateMe);
  app.patch("/me/password", authMiddleware, requireUser, privateCacheNoStore, changePassword);
  app.delete("/me", authMiddleware, requireUser, privateCacheNoStore, deleteMe);

  app.use("/auth", privateCacheNoStore, authRoutes);
  app.use("/access", privateCacheNoStore, accessRoutes);
  app.use("/scan", privateCacheNoStore, scanRoutes);
  app.use("/internal/scans", privateCacheNoStore, internalOpsMiddleware, scanAdminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
