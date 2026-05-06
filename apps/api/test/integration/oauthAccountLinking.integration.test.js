"use strict";

const path = require("path");
const crypto = require("crypto");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env"),
});

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer } = require("./httpServer");
const { configurePassport, passport } = require("../../src/config/passport");

function truthy(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
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

async function signup(baseUrl, email, password) {
  return fetchJson(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function googleVerify() {
  const strategy = passport._strategy("google");
  assert.ok(strategy && typeof strategy._verify === "function", "google strategy must be configured");
  return strategy._verify;
}

function githubVerify() {
  const strategy = passport._strategy("github");
  assert.ok(strategy && typeof strategy._verify === "function", "github strategy must be configured");
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

async function runGithubOAuth(profile, accessToken = "gh-access-token") {
  const verify = githubVerify();
  return new Promise((resolve, reject) => {
    verify(accessToken, "refresh-token", profile, (error, user, info) => {
      if (error) return reject(error);
      return resolve({ user, info });
    });
  });
}

d("oauth account linking", () => {
  /** @type {import('pg').Pool} */
  let pool;
  let baseUrl;
  let closeServer;
  const createdEmails = new Set();

  before(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test-google-client-secret";
    process.env.GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost/google/callback";
    process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "test-github-client-id";
    process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "test-github-client-secret";
    process.env.GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || "http://localhost/github/callback";
    configurePassport();
    // eslint-disable-next-line global-require
    pool = require("../../src/db/pool").pool;
    const server = await startTestServer();
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  after(async () => {
    if (createdEmails.size > 0) {
      await pool.query("DELETE FROM users WHERE lower(email) = ANY($1::text[])", [
        [...createdEmails].map((email) => String(email).toLowerCase()),
      ]);
    }
    if (closeServer) await closeServer();
  });

  it("password signup then Google OAuth with same verified email uses same user", async () => {
    const email = `oauth-link-a-${crypto.randomBytes(6).toString("hex")}@example.test`;
    createdEmails.add(email);

    const signupRes = await signup(baseUrl, email.toUpperCase(), "PasswordA1!");
    assert.equal(signupRes.res.status, 201, JSON.stringify(signupRes.body));

    const beforeQ = await pool.query("SELECT id, email, google_id FROM users WHERE lower(email) = $1 LIMIT 1", [
      email,
    ]);
    const beforeUser = beforeQ.rows[0];
    assert.ok(beforeUser, "signed-up user must exist");
    assert.equal(beforeUser.google_id, null);

    const googleRes = await runGoogleOAuth({
      id: `google-${crypto.randomBytes(5).toString("hex")}`,
      displayName: "Google Person",
      photos: [{ value: "https://example.test/avatar-google.png" }],
      emails: [{ value: email, verified: true }],
      _json: { email, email_verified: true },
    });

    assert.ok(googleRes.user, JSON.stringify(googleRes.info || {}));
    assert.equal(googleRes.user.id, beforeUser.id, "oauth login should link to existing user row");

    const afterQ = await pool.query(
      "SELECT id, email, google_id, display_name, avatar_url FROM users WHERE id = $1 LIMIT 1",
      [beforeUser.id],
    );
    assert.equal(afterQ.rows[0].email, email);
    assert.ok(afterQ.rows[0].google_id, "google_id should be linked");
    assert.equal(afterQ.rows[0].display_name, "Google Person");
    assert.equal(afterQ.rows[0].avatar_url, "https://example.test/avatar-google.png");
  });

  it("Google OAuth then password signup with same email is rejected", async () => {
    const email = `oauth-link-b-${crypto.randomBytes(6).toString("hex")}@example.test`;
    createdEmails.add(email);

    const googleRes = await runGoogleOAuth({
      id: `google-${crypto.randomBytes(5).toString("hex")}`,
      displayName: "First OAuth",
      emails: [{ value: email.toUpperCase(), verified: true }],
      _json: { email, email_verified: true },
    });
    assert.ok(googleRes.user && googleRes.user.id, JSON.stringify(googleRes.info || {}));

    const signupRes = await signup(baseUrl, email, "PasswordB1!");
    assert.equal(signupRes.res.status, 409, JSON.stringify(signupRes.body));
    assert.equal(signupRes.body.error, "Email already exists");

    const countQ = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE lower(email) = $1", [email]);
    assert.equal(countQ.rows[0].c, 1, "must not create a duplicate user for same email");
  });

  it("Google OAuth then GitHub OAuth with same email uses same user", async () => {
    const email = `oauth-link-c-${crypto.randomBytes(6).toString("hex")}@example.test`;
    createdEmails.add(email);

    const googleRes = await runGoogleOAuth({
      id: `google-${crypto.randomBytes(5).toString("hex")}`,
      displayName: "Google Name",
      emails: [{ value: email, verified: true }],
      _json: { email, email_verified: true },
    });
    assert.ok(googleRes.user && googleRes.user.id, JSON.stringify(googleRes.info || {}));
    const linkedUserId = googleRes.user.id;

    const githubRes = await runGithubOAuth({
      id: `github-${crypto.randomBytes(5).toString("hex")}`,
      username: "github-user",
      photos: [{ value: "https://example.test/avatar-github.png" }],
      emails: [{ value: email.toUpperCase(), verified: true }],
    });
    assert.ok(githubRes.user && githubRes.user.id, JSON.stringify(githubRes.info || {}));
    assert.equal(githubRes.user.id, linkedUserId);

    const rowQ = await pool.query(
      "SELECT id, email, google_id, github_id FROM users WHERE lower(email) = $1 LIMIT 1",
      [email],
    );
    assert.equal(rowQ.rows[0].id, linkedUserId);
    assert.ok(rowQ.rows[0].google_id);
    assert.ok(rowQ.rows[0].github_id);
  });

  it("email case differences across OAuth and signup do not create duplicates", async () => {
    const baseEmail = `oauth-link-d-${crypto.randomBytes(6).toString("hex")}@example.test`;
    createdEmails.add(baseEmail);

    const firstGoogle = await runGoogleOAuth({
      id: `google-${crypto.randomBytes(5).toString("hex")}`,
      displayName: "Case Test",
      emails: [{ value: baseEmail.toUpperCase(), verified: true }],
      _json: { email: baseEmail.toUpperCase(), email_verified: true },
    });
    assert.ok(firstGoogle.user && firstGoogle.user.id);

    const secondGoogle = await runGoogleOAuth({
      id: `google-${crypto.randomBytes(5).toString("hex")}`,
      displayName: "Should Not Rebind ID",
      emails: [{ value: `  ${baseEmail}  `, verified: true }],
      _json: { email: baseEmail, email_verified: true },
    });
    assert.equal(secondGoogle.user.id, firstGoogle.user.id);

    const signupRes = await signup(baseUrl, `  ${baseEmail.toUpperCase()}  `, "PasswordD1!");
    assert.equal(signupRes.res.status, 409, JSON.stringify(signupRes.body));

    const countQ = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE lower(email) = $1", [baseEmail]);
    assert.equal(countQ.rows[0].c, 1, "email normalization must prevent case-based duplicates");
  });
});
