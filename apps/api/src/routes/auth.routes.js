const express = require("express");
const {
  signup,
  login,
  logout,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  issueAuthSession,
} = require("../controllers/auth.controller");
const { passport } = require("../config/passport");
const { authMiddleware, requireUser } = require("../middleware/auth.middleware");

const router = express.Router();

function isGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL
  );
}

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
// Mounted at app.use("/auth", ...) → public paths are GET /auth/google and GET /auth/google/callback
router.get("/google", (req, res, next) => {
  console.info("[auth] GET /auth/google");
  if (!isGoogleConfigured()) {
    return res.status(503).json({ error: "Google OAuth is not configured." });
  }
  return passport.authenticate("google", { scope: ["profile", "email"], session: false })(
    req,
    res,
    next
  );
});
router.get("/google/callback", (req, res, next) => {
  if (!isGoogleConfigured()) {
    return res.redirect(`${process.env.WEB_APP_URL || "http://localhost:5173"}/login?auth=failed`);
  }
  return passport.authenticate("google", { session: false }, (error, user) => {
    const webAppUrl = process.env.WEB_APP_URL || "http://localhost:5173";
    if (error || !user || !user.email) {
      return res.redirect(`${webAppUrl}/login?auth=failed`);
    }
    issueAuthSession(res, user);
    return res.redirect(`${webAppUrl}/dashboard`);
  })(req, res, next);
});
router.get("/apikeys", authMiddleware, requireUser, listApiKeys);
router.post("/apikeys", authMiddleware, requireUser, createApiKey);
router.delete("/apikeys/:id", authMiddleware, requireUser, deleteApiKey);

module.exports = router;
