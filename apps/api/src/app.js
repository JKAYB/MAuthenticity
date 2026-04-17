const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");
const scanRoutes = require("./routes/scan.routes");
const { getMe, updateMe, changePassword } = require("./controllers/auth.controller");
const { authMiddleware, requireUser } = require("./middleware/auth.middleware");
const { apiKeyMiddleware } = require("./middleware/apikey.middleware");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

function createApp() {
  const app = express();
  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174,https://mauthenticity.netlify.app")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS blocked for this origin"));
      }
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/me", authMiddleware, apiKeyMiddleware, requireUser, getMe);
  app.patch("/me", authMiddleware, apiKeyMiddleware, requireUser, updateMe);
  app.patch("/me/password", authMiddleware, apiKeyMiddleware, requireUser, changePassword);

  app.use("/auth", authRoutes);
  app.use("/scan", scanRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
