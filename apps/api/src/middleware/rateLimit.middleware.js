"use strict";

const { normalizeEmail } = require("../utils/normalizeEmail");

function createIpEmailRateLimit({
  windowMs = 15 * 60 * 1000,
  maxAttempts = 5,
  keyPrefix = "ip-email",
  successResponse = { ok: true },
} = {}) {
  const store = new Map();

  function sweepExpired(now) {
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }

  return function ipEmailRateLimit(req, res, next) {
    const now = Date.now();
    if (store.size > 0) {
      sweepExpired(now);
    }
    const ip = String(req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown");
    const email = normalizeEmail(req.body?.email);
    const key = `${keyPrefix}:${ip}:${email}`;
    const current = store.get(key);

    if (!email) {
      return next();
    }

    if (!current || current.expiresAt <= now) {
      store.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    if (current.count >= maxAttempts) {
      // Return an indistinguishable response to avoid side channels.
      return res.status(200).json(successResponse);
    }

    current.count += 1;
    store.set(key, current);
    return next();
  };
}

function createPasswordResetRequestRateLimit() {
  const parsedWindowMs = Number(process.env.PASSWORD_RESET_REQUEST_WINDOW_MS || 15 * 60 * 1000);
  const parsedMaxAttempts = Number(process.env.PASSWORD_RESET_REQUEST_MAX_ATTEMPTS || 3);
  const windowMs = Number.isFinite(parsedWindowMs) && parsedWindowMs > 0 ? parsedWindowMs : 15 * 60 * 1000;
  const maxAttempts =
    Number.isFinite(parsedMaxAttempts) && parsedMaxAttempts > 0 ? parsedMaxAttempts : 3;

  return createIpEmailRateLimit({
    windowMs,
    maxAttempts,
    keyPrefix: "password-reset-request",
    successResponse: {
      ok: true,
      message: "If an account exists, reset instructions have been sent.",
    },
  });
}

module.exports = {
  createIpEmailRateLimit,
  createPasswordResetRequestRateLimit,
};
