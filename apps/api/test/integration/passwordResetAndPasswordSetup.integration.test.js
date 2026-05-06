"use strict";

const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env"),
});

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { v4: uuidv4 } = require("uuid");
const { startTestServer } = require("./httpServer");
const { configurePassport, passport } = require("../../src/config/passport");

function truthy(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

const enabled = truthy(process.env.RUN_API_INTEGRATION) && Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }
  return { res, body };
}

function authCookieForUser(userId, email) {
  const token = jwt.sign({ sub: userId, email }, process.env.JWT_SECRET || "change-me", { expiresIn: "1d" });
  return `auth_token=${token}`;
}

function sha256(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function googleVerify() {
  const strategy = passport._strategy("google");
  assert.ok(strategy && typeof strategy._verify === "function", "google strategy must be configured");
  return strategy._verify;
}

async function runGoogleOAuth(profile) {
  const verify = googleVerify();
  return new Promise((resolve, reject) => {
    verify("access-token", "refresh-token", profile, (error, user, info) => {
      if (error) return reject(error);
      return resolve({ user, info });
    });
  });
}

d("password setup and reset flow", () => {
  /** @type {import('pg').Pool} */
  let pool;
  let baseUrl;
  let closeServer;
  const createdUserIds = [];

  before(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test-google-client-secret";
    process.env.GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost/google/callback";
    process.env.PASSWORD_RESET_REQUEST_WINDOW_MS = "600000";
    process.env.PASSWORD_RESET_REQUEST_MAX_ATTEMPTS = "1";
    configurePassport();
    // eslint-disable-next-line global-require
    pool = require("../../src/db/pool").pool;
    const server = await startTestServer();
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  after(async () => {
    if (createdUserIds.length > 0) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
    }
    if (closeServer) await closeServer();
  });

  it("oauth-style users have hasPassword=false and can set password via /me/password", async () => {
    const email = `oauth-only-${crypto.randomBytes(6).toString("hex")}@example.test`;
    const userId = uuidv4();
    createdUserIds.push(userId);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, plan, plan_selected, must_change_password)
       VALUES ($1, $2, $3, 'free', FALSE, FALSE)`,
      [userId, email, sha256(`oauth:${uuidv4()}`)]
    );

    const meRes = await fetchJson(`${baseUrl}/me`, {
      headers: { Cookie: authCookieForUser(userId, email) },
    });
    assert.equal(meRes.res.status, 200);
    assert.equal(meRes.body.hasPassword, false);

    const setPwRes = await fetchJson(`${baseUrl}/me/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: authCookieForUser(userId, email) },
      body: JSON.stringify({
        newPassword: "NewStrongPass1",
        confirmPassword: "NewStrongPass1",
      }),
    });
    assert.equal(setPwRes.res.status, 200, JSON.stringify(setPwRes.body));

    const meAfter = await fetchJson(`${baseUrl}/me`, {
      headers: { Cookie: authCookieForUser(userId, email) },
    });
    assert.equal(meAfter.res.status, 200);
    assert.equal(meAfter.body.hasPassword, true);

    const loginRes = await fetchJson(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "NewStrongPass1" }),
    });
    assert.equal(loginRes.res.status, 200, JSON.stringify(loginRes.body));
  });

  it("existing password user must provide current password to change", async () => {
    const email = `pw-user-${crypto.randomBytes(6).toString("hex")}@example.test`;
    const userId = uuidv4();
    createdUserIds.push(userId);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, plan, plan_selected, must_change_password)
       VALUES ($1, $2, $3, 'free', FALSE, FALSE)`,
      [userId, email, await bcrypt.hash("CurrentPass1", 12)]
    );

    const noCurrent = await fetchJson(`${baseUrl}/me/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: authCookieForUser(userId, email) },
      body: JSON.stringify({ newPassword: "UpdatedPass1", confirmPassword: "UpdatedPass1" }),
    });
    assert.equal(noCurrent.res.status, 400);

    const wrongCurrent = await fetchJson(`${baseUrl}/me/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: authCookieForUser(userId, email) },
      body: JSON.stringify({
        currentPassword: "WrongPass1",
        newPassword: "UpdatedPass1",
        confirmPassword: "UpdatedPass1",
      }),
    });
    assert.equal(wrongCurrent.res.status, 400);

    const okChange = await fetchJson(`${baseUrl}/me/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: authCookieForUser(userId, email) },
      body: JSON.stringify({
        currentPassword: "CurrentPass1",
        newPassword: "UpdatedPass1",
        confirmPassword: "UpdatedPass1",
      }),
    });
    assert.equal(okChange.res.status, 200, JSON.stringify(okChange.body));
  });

  it("forgot password request is generic and stores hashed token", async () => {
    const email = `reset-generic-${crypto.randomBytes(6).toString("hex")}@example.test`;
    const userId = uuidv4();
    createdUserIds.push(userId);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, plan, plan_selected, must_change_password)
       VALUES ($1, $2, $3, 'free', FALSE, FALSE)`,
      [userId, email, await bcrypt.hash("InitialPass1", 12)]
    );

    const existingRes = await fetchJson(`${baseUrl}/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const missingRes = await fetchJson(`${baseUrl}/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `missing-${email}` }),
    });
    assert.equal(existingRes.res.status, 200);
    assert.equal(missingRes.res.status, 200);
    assert.equal(existingRes.body.message, missingRes.body.message);

    const tokenQ = await pool.query(
      `SELECT token_hash
       FROM password_reset_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    assert.ok(tokenQ.rows[0]?.token_hash);
    assert.match(tokenQ.rows[0].token_hash, /^[a-f0-9]{64}$/i);
  });

  it("repeated reset requests are throttled by ip+email and keep generic response", async () => {
    const email = `reset-throttle-${crypto.randomBytes(6).toString("hex")}@example.test`;
    const userId = uuidv4();
    createdUserIds.push(userId);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, plan, plan_selected, must_change_password)
       VALUES ($1, $2, $3, 'free', FALSE, FALSE)`,
      [userId, email, await bcrypt.hash("InitialPass1", 12)]
    );

    const first = await fetchJson(`${baseUrl}/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const second = await fetchJson(`${baseUrl}/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toUpperCase() }),
    });

    assert.equal(first.res.status, 200);
    assert.equal(second.res.status, 200);
    assert.deepEqual(first.body, second.body);

    const tokenCountQ = await pool.query(
      "SELECT COUNT(*)::int AS c FROM password_reset_tokens WHERE user_id = $1",
      [userId]
    );
    assert.equal(tokenCountQ.rows[0].c, 1, "throttled requests must not create additional reset tokens");
  });

  it("valid reset token updates password, token is one-time, expired tokens fail, and OAuth still works", async () => {
    const email = `reset-confirm-${crypto.randomBytes(6).toString("hex")}@example.test`;
    const userId = uuidv4();
    createdUserIds.push(userId);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, plan, plan_selected, must_change_password)
       VALUES ($1, $2, $3, 'free', FALSE, FALSE)`,
      [userId, email, await bcrypt.hash("OldPass1A", 12)]
    );

    const rawToken = `raw-${crypto.randomBytes(24).toString("hex")}`;
    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [uuidv4(), userId, sha256(rawToken)]
    );

    const confirmRes = await fetchJson(`${baseUrl}/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: rawToken,
        newPassword: "BrandNewPass1",
        confirmPassword: "BrandNewPass1",
      }),
    });
    assert.equal(confirmRes.res.status, 200, JSON.stringify(confirmRes.body));

    const reuseRes = await fetchJson(`${baseUrl}/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: rawToken,
        newPassword: "AnotherPass1",
        confirmPassword: "AnotherPass1",
      }),
    });
    assert.equal(reuseRes.res.status, 400);

    const expiredRaw = `expired-${crypto.randomBytes(24).toString("hex")}`;
    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '10 minutes')`,
      [uuidv4(), userId, sha256(expiredRaw)]
    );
    const expiredRes = await fetchJson(`${baseUrl}/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: expiredRaw,
        newPassword: "AnotherPass1",
        confirmPassword: "AnotherPass1",
      }),
    });
    assert.equal(expiredRes.res.status, 400);

    const loginRes = await fetchJson(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "BrandNewPass1" }),
    });
    assert.equal(loginRes.res.status, 200, JSON.stringify(loginRes.body));

    const oauthRes = await runGoogleOAuth({
      id: `google-${crypto.randomBytes(5).toString("hex")}`,
      displayName: "OAuth After Reset",
      emails: [{ value: email, verified: true }],
      _json: { email, email_verified: true },
    });
    assert.ok(oauthRes.user && oauthRes.user.id);
    assert.equal(oauthRes.user.id, userId);
  });
});
