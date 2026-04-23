/**
 * API integration tests: scan create/retrieve, auth, user isolation, optional queue + worker E2E.
 *
 * Enable: RUN_API_INTEGRATION=1 (requires DATABASE_URL, REDIS_URL, JWT_SECRET in .env, migrations applied).
 * For API→queue→worker→DB E2E: set RUN_API_INTEGRATION_WORKER=1 (starts in-process worker only for that suite).
 * DETECTION_PROVIDER=mock is forced in `before` when unset.
 *
 * Load order: dotenv before any src/db import.
 */

"use strict";

const path = require("path");
const crypto = require("crypto");
require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env")
});

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

function truthy(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

const apiIntegrationEnabled =
  truthy(process.env.RUN_API_INTEGRATION) &&
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.REDIS_URL);

const runWorkerE2E = truthy(process.env.RUN_API_INTEGRATION_WORKER);

const d = apiIntegrationEnabled ? describe : describe.skip;

/** 1×1 transparent PNG (valid for multer image/png). */
const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

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

async function signupLogin(baseUrl, email, password) {
  let r = await fetchJson(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(r.res.status, 201, `signup failed: ${JSON.stringify(r.body)}`);

  r = await fetchJson(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(r.res.status, 200, `login failed: ${JSON.stringify(r.body)}`);
  assert.ok(r.body.token, "missing token");
  return r.body.token;
}

async function waitForScanStatus(pool, scanId, want, timeoutMs = 25000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition -- poll loop
  while (true) {
    const { rows } = await pool.query(`SELECT status FROM scans WHERE id = $1`, [scanId]);
    const st = rows[0] && rows[0].status;
    if (st === want) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timeout waiting for scan ${scanId} status ${want}, got ${st}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

d("API scan integration", () => {
  let baseUrl;
  let closeServer;
  /** @type {import('pg').Pool} */
  let pool;
  const createdUserIds = [];
  const createdScanIds = [];
  let savedObjectStorageProvider;

  before(async () => {
    process.env.DETECTION_PROVIDER = process.env.DETECTION_PROVIDER || "mock";
    delete process.env.DETECTION_REAL_URL;

    savedObjectStorageProvider = process.env.OBJECT_STORAGE_PROVIDER;
    process.env.OBJECT_STORAGE_PROVIDER = "local";
    delete process.env.OBJECT_STORAGE_BUCKET;

    // eslint-disable-next-line global-require
    pool = require("../../src/db/pool").pool;
    const { startTestServer } = require("./httpServer");
    const s = await startTestServer();
    baseUrl = s.baseUrl;
    closeServer = s.close;
  });

  after(async () => {
    const { Queue } = require("bullmq");
    const { connection } = require("../../src/db/redis");
    const qCleanup = new Queue("scan-jobs", { connection });
    try {
      for (const scanId of createdScanIds) {
        try {
          const j = await qCleanup.getJob(scanId);
          if (j) {
            await j.remove();
          }
        } catch {
          /* ignore */
        }
        try {
          await pool.query("DELETE FROM scans WHERE id = $1", [scanId]);
        } catch {
          /* ignore */
        }
      }
    } finally {
      await qCleanup.close();
    }

    for (const uid of createdUserIds) {
      try {
        await pool.query("DELETE FROM api_keys WHERE user_id = $1", [uid]);
        await pool.query("DELETE FROM scans WHERE user_id = $1", [uid]);
        await pool.query("DELETE FROM users WHERE id = $1", [uid]);
      } catch {
        /* ignore */
      }
    }
    if (closeServer) {
      await closeServer();
    }
    if (savedObjectStorageProvider === undefined) {
      delete process.env.OBJECT_STORAGE_PROVIDER;
    } else {
      process.env.OBJECT_STORAGE_PROVIDER = savedObjectStorageProvider;
    }
  });

  it("rejects unauthenticated scan POST", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([MIN_PNG], { type: "image/png" }), "x.png");
    const res = await fetch(`${baseUrl}/scan`, { method: "POST", body: fd });
    assert.equal(res.status, 401);
  });

  it("rejects JSON scan without url", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    createdUserIds.push((await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id);

    const { res, body } = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 400);
    assert.match(String(body.error || ""), /url is required/i);
  });

  it("rejects invalid URL", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    createdUserIds.push((await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id);

    const { res, body } = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-valid-url" })
    });
    assert.equal(res.status, 400);
    assert.ok(String(body.error || "").length > 0);
  });

  it("rejects ftp URL", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    createdUserIds.push((await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id);

    const { res } = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "ftp://example.com/a.png" })
    });
    assert.equal(res.status, 400);
  });

  it("rejects upload without file", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    createdUserIds.push((await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id);

    const fd = new FormData();
    const res = await fetch(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    assert.equal(res.status, 400);
  });

  it("authenticated URL scan creates row and enqueues job", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    const userId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(userId);

    const { res, body } = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/media/sample.mp4" })
    });
    assert.equal(res.status, 202, JSON.stringify(body));
    assert.ok(body.id);
    assert.equal(body.status, "pending");
    const scanId = body.id;
    createdScanIds.push(scanId);

    const { rows } = await pool.query(
      `SELECT status, source_type, source_url, storage_key, filename, user_id FROM scans WHERE id = $1`,
      [scanId]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[0].source_type, "url");
    assert.match(String(rows[0].source_url || ""), /example\.com/);
    assert.equal(rows[0].storage_key, null);
    assert.equal(rows[0].user_id, userId);

    const { Queue } = require("bullmq");
    const { connection } = require("../../src/db/redis");
    const q = new Queue("scan-jobs", { connection });
    try {
      const job = await q.getJob(scanId);
      assert.ok(job, "queue job missing");
      const state = await job.getState();
      assert.ok(
        ["waiting", "delayed", "active", "completed"].includes(state),
        `unexpected job state: ${state}`
      );
      const jd = job.data;
      assert.equal(jd.scanId, scanId);
      assert.equal(jd.userId, userId);
    } finally {
      await q.close();
    }
  });

  it("authenticated upload creates row with storage_key and enqueues", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    const userId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(userId);

    const fd = new FormData();
    fd.append("file", new Blob([MIN_PNG], { type: "image/png" }), "pixel.png");
    const { res, body } = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    assert.equal(res.status, 202, JSON.stringify(body));
    const scanId = body.id;
    createdScanIds.push(scanId);

    const { rows } = await pool.query(
      `SELECT source_type, storage_key, storage_provider, filename, mime_type, file_size_bytes, status FROM scans WHERE id = $1`,
      [scanId]
    );
    assert.equal(rows[0].source_type, "upload");
    assert.equal(rows[0].storage_provider, "local");
    assert.ok(rows[0].storage_key && String(rows[0].storage_key).includes(scanId));
    assert.ok(
      String(rows[0].storage_key).includes("scans/users/") && String(rows[0].storage_key).includes(String(userId)),
      "structured local storage key"
    );
    assert.equal(rows[0].filename, "pixel.png");
    assert.equal(rows[0].mime_type, "image/png");
    assert.ok(Number(rows[0].file_size_bytes) > 0);
    assert.equal(rows[0].status, "pending");

    const { Queue } = require("bullmq");
    const { connection } = require("../../src/db/redis");
    const q = new Queue("scan-jobs", { connection });
    try {
      const job = await q.getJob(scanId);
      assert.ok(job, "queue job missing for upload");
      assert.deepEqual(job.data, { scanId, userId });
    } finally {
      await q.close();
    }
  });

  it("retry reuses original selected providers snapshot even after provider config change", async () => {
    const email = `u-retry-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    const userId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(userId);

    const fd = new FormData();
    fd.append("file", new Blob([MIN_PNG], { type: "image/png" }), "retry.png");
    const created = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    assert.equal(created.res.status, 202, JSON.stringify(created.body));
    const originalScanId = created.body.id;
    createdScanIds.push(originalScanId);

    await pool.query(
      `UPDATE scans
       SET status = 'failed',
           error_message = 'Synthetic failure for retry test',
           last_error = 'Synthetic failure for retry test',
           selected_providers = ARRAY['hive']::text[]
       WHERE id = $1`,
      [originalScanId]
    );

    const { scanProviders } = require("../../src/config/scanProviders");
    const hive = scanProviders().find((p) => p.id === "hive");
    assert.ok(hive, "hive provider missing in config");
    const originalHiveEnabled = hive.enabled;
    hive.enabled = false;

    try {
      const retried = await fetchJson(`${baseUrl}/scan/${originalScanId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(retried.res.status, 202, JSON.stringify(retried.body));
      assert.equal(retried.body.ok, true);
      assert.ok(retried.body.scan && retried.body.scan.id);
      const retryScanId = retried.body.scan.id;
      createdScanIds.push(retryScanId);

      const { rows } = await pool.query(
        `SELECT selected_providers, retry_of_scan_id, scan_group_id, attempt_number
         FROM scans
         WHERE id = $1`,
        [retryScanId]
      );
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].selected_providers, ["hive"]);
      assert.equal(rows[0].retry_of_scan_id, originalScanId);
      assert.ok(rows[0].scan_group_id);
      assert.equal(Number(rows[0].attempt_number), 2);
    } finally {
      hive.enabled = originalHiveEnabled;
    }
  });

  it("retry_count increments across multiple retries", async () => {
    const email = `u-retry-count-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    const userId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(userId);

    const fd = new FormData();
    fd.append("file", new Blob([MIN_PNG], { type: "image/png" }), "retry-count.png");
    const created = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    assert.equal(created.res.status, 202, JSON.stringify(created.body));
    let currentScanId = created.body.id;
    createdScanIds.push(currentScanId);

    await pool.query(
      `UPDATE scans
       SET status = 'failed',
           error_message = 'Force retry 1',
           last_error = 'Force retry 1',
           retry_count = 0,
           selected_providers = ARRAY['hive']::text[]
       WHERE id = $1`,
      [currentScanId]
    );

    const retry1 = await fetchJson(`${baseUrl}/scan/${currentScanId}/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(retry1.res.status, 202, JSON.stringify(retry1.body));
    assert.equal(Number(retry1.body.scan.retryCount), 1);
    const retry1Id = retry1.body.scan.id;
    createdScanIds.push(retry1Id);

    let row = await pool.query(`SELECT retry_count, attempt_number FROM scans WHERE id = $1`, [retry1Id]);
    assert.equal(Number(row.rows[0].retry_count), 1);
    assert.equal(Number(row.rows[0].attempt_number), 2);

    await pool.query(
      `UPDATE scans
       SET status = 'failed',
           error_message = 'Force retry 2',
           last_error = 'Force retry 2'
       WHERE id = $1`,
      [retry1Id]
    );

    const retry2 = await fetchJson(`${baseUrl}/scan/${retry1Id}/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(retry2.res.status, 202, JSON.stringify(retry2.body));
    assert.equal(Number(retry2.body.scan.retryCount), 2);
    const retry2Id = retry2.body.scan.id;
    createdScanIds.push(retry2Id);

    row = await pool.query(`SELECT retry_count, attempt_number FROM scans WHERE id = $1`, [retry2Id]);
    assert.equal(Number(row.rows[0].retry_count), 2);
    assert.equal(Number(row.rows[0].attempt_number), 3);
  });

  it("rejects malformed JSON for URL scan", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    createdUserIds.push((await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id);

    const res = await fetch(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{not-json"
    });
    assert.equal(res.status, 400);
  });

  it("rejects unsupported upload MIME type", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    createdUserIds.push((await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id);

    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("%PDF-1.4")], { type: "application/pdf" }), "x.pdf");
    const { res, body } = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    assert.equal(res.status, 400);
    assert.match(String(body.error || ""), /unsupported file type/i);
  });

  it("history and detail are user-scoped", async () => {
    const emailA = `a-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const emailB = `b-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const tokenA = await signupLogin(baseUrl, emailA, password);
    const tokenB = await signupLogin(baseUrl, emailB, password);
    const idA = (await pool.query(`SELECT id FROM users WHERE email = $1`, [emailA])).rows[0].id;
    const idB = (await pool.query(`SELECT id FROM users WHERE email = $1`, [emailB])).rows[0].id;
    createdUserIds.push(idA, idB);

    const fd = new FormData();
    fd.append("file", new Blob([MIN_PNG], { type: "image/png" }), "a.png");
    const up = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: fd
    });
    assert.equal(up.res.status, 202);
    const scanId = up.body.id;
    createdScanIds.push(scanId);

    const histA = await fetchJson(`${baseUrl}/scan/history`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(histA.res.status, 200);
    const histRow = histA.body.data.find((row) => row.id === scanId);
    assert.ok(histRow, "scan missing from history");
    assert.ok("summary" in histRow);
    assert.ok("detection_provider" in histRow);
    assert.equal(histRow.source_type, "upload");
    // Another process may share REDIS_URL and consume jobs before these reads.
    assert.ok(
      ["pending", "processing", "completed", "failed"].includes(histRow.status),
      `unexpected history status ${histRow.status}`
    );

    const histB = await fetchJson(`${baseUrl}/scan/history`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(histB.res.status, 200);
    assert.ok(!histB.body.data.some((row) => row.id === scanId));

    const leak = await fetchJson(`${baseUrl}/scan/${scanId}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(leak.res.status, 404);

    const own = await fetchJson(`${baseUrl}/scan/${scanId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(own.res.status, 200);
    assert.equal(own.body.id, scanId);
    assert.ok("summary" in own.body);
    assert.ok("detection_provider" in own.body);
    assert.equal(own.body.source_type, "upload");
    assert.ok(
      ["pending", "processing", "completed", "failed"].includes(own.body.status),
      `unexpected detail status ${own.body.status}`
    );
  });

  it("scan analytics endpoints require authentication", async () => {
    const act = await fetchJson(`${baseUrl}/scan/analytics/activity`);
    assert.equal(act.res.status, 401);
    const mix = await fetchJson(`${baseUrl}/scan/analytics/detection-mix`);
    assert.equal(mix.res.status, 401);
  });

  it("scan analytics rejects invalid range", async () => {
    const email = `an-bad-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    createdUserIds.push((await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id);

    const { res, body } = await fetchJson(`${baseUrl}/scan/analytics/activity?range=1d`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 400);
    assert.ok(String(body.error || "").length > 0);
  });

  it("scan analytics activity is scoped to the authenticated user", async () => {
    const emailA = `an-a-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const tokenA = await signupLogin(baseUrl, emailA, "TestUser1!");
    const userA = (await pool.query(`SELECT id FROM users WHERE email = $1`, [emailA])).rows[0].id;
    createdUserIds.push(userA);

    const scanA1 = crypto.randomUUID();
    createdScanIds.push(scanA1);
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, storage_key, storage_provider, completed_at, created_at, is_ai_generated, confidence)
       VALUES ($1, $2, 'a.jpg', 'image/jpeg', 10, 'completed', 'upload', $3, 'local', NOW(), NOW() - INTERVAL '6 hours', true, 90)`,
      [scanA1, userA, `${scanA1}/a.jpg`]
    );

    const rA = await fetchJson(`${baseUrl}/scan/analytics/activity?range=7d`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(rA.res.status, 200, JSON.stringify(rA.body));
    assert.equal(rA.body.range, "7d");
    assert.equal(rA.body.groupBy, "day");
    assert.equal(rA.body.points.length, 7);
    assert.ok(rA.body.summary && typeof rA.body.summary.total === "number");
    assert.ok(rA.body.summary.total >= 1);

    const emailB = `an-b-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const tokenB = await signupLogin(baseUrl, emailB, "TestUser1!");
    const userB = (await pool.query(`SELECT id FROM users WHERE email = $1`, [emailB])).rows[0].id;
    createdUserIds.push(userB);

    const rB = await fetchJson(`${baseUrl}/scan/analytics/activity?range=7d`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(rB.res.status, 200);
    assert.equal(rB.body.summary.total, 0);

    await pool.query(`DELETE FROM scans WHERE id = $1`, [scanA1]);
    const idx = createdScanIds.indexOf(scanA1);
    if (idx >= 0) createdScanIds.splice(idx, 1);
  });

  it("scan analytics detection-mix aggregates completed and failed", async () => {
    const email = `an-mix-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const token = await signupLogin(baseUrl, email, "TestUser1!");
    const userId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(userId);

    const s1 = crypto.randomUUID();
    const s2 = crypto.randomUUID();
    const s3 = crypto.randomUUID();
    const s4 = crypto.randomUUID();
    createdScanIds.push(s1, s2, s3, s4);

    const ins = `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, storage_key, storage_provider, completed_at, created_at, is_ai_generated, confidence)
                 VALUES ($1, $2, $3, 'image/jpeg', 1, $4, 'upload', $5, 'local', $6, NOW(), $7, $8)`;
    await pool.query(ins, [s1, userId, "a.jpg", "completed", `${s1}/a.jpg`, new Date(), false, 10]);
    await pool.query(ins, [s2, userId, "b.jpg", "completed", `${s2}/b.jpg`, new Date(), true, 90]);
    await pool.query(ins, [s3, userId, "c.jpg", "completed", `${s3}/c.jpg`, new Date(), null, 50]);
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, storage_key, storage_provider, completed_at, created_at, is_ai_generated, confidence)
       VALUES ($1, $2, 'd.jpg', 'image/jpeg', 1, 'failed', 'upload', $3, 'local', NULL, NOW(), NULL, NULL)`,
      [s4, userId, `${s4}/d.jpg`]
    );

    const { res, body } = await fetchJson(`${baseUrl}/scan/analytics/detection-mix?range=7d`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.total, 4);
    const byKey = Object.fromEntries((body.items || []).map((x) => [x.key, x]));
    assert.equal(byKey.authentic.count, 1);
    assert.equal(byKey.manipulated.count, 1);
    assert.equal(byKey.suspicious.count, 2);
    assert.equal(byKey.authentic.percentage + byKey.manipulated.percentage + byKey.suspicious.percentage, 100);

    for (const id of [s1, s2, s3, s4]) {
      await pool.query(`DELETE FROM scans WHERE id = $1`, [id]);
    }
    for (const id of [s1, s2, s3, s4]) {
      const i = createdScanIds.indexOf(id);
      if (i >= 0) createdScanIds.splice(i, 1);
    }
  });

  const dWorker = runWorkerE2E ? describe : describe.skip;
  dWorker("API scan with in-process worker (E2E)", () => {
    let worker;
    let queue;

    before(async () => {
      const workerHarnessPath = path.join(__dirname, "../../../worker/test/integration/workerHarness.js");
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const { createTestWorker, createTestQueue } = require(workerHarnessPath);
      queue = createTestQueue();
      worker = createTestWorker();
      await new Promise((r) => setTimeout(r, 350));
    });

    after(async () => {
      if (worker) {
        await worker.close();
      }
      if (queue) {
        await queue.close();
      }
    });

    it("E2E: upload via API then worker completes and detail shows results", async () => {
      const email = `e2e-${crypto.randomBytes(6).toString("hex")}@t.local`;
      const password = "TestUser1!";
      const token = await signupLogin(baseUrl, email, password);
      const userId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
      createdUserIds.push(userId);

      const fd = new FormData();
      fd.append("file", new Blob([MIN_PNG], { type: "image/png" }), "e2e.png");
      const { res, body } = await fetchJson(`${baseUrl}/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      assert.equal(res.status, 202);
      const scanId = body.id;
      createdScanIds.push(scanId);

      await waitForScanStatus(pool, scanId, "completed");

      const detail = await fetchJson(`${baseUrl}/scan/${scanId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(detail.res.status, 200);
      assert.equal(detail.body.status, "completed");
      assert.ok(detail.body.summary && String(detail.body.summary).includes("Mock"));
      assert.ok(detail.body.confidence != null);
      assert.ok(typeof detail.body.is_ai_generated === "boolean");
      assert.ok(detail.body.result_payload && typeof detail.body.result_payload === "object");
      assert.equal(detail.body.detection_provider, "mock");
      assert.ok(detail.body.completed_at);

      const mediaRes = await fetch(`${baseUrl}/scan/${scanId}/media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(mediaRes.status, 200);
      const ct = String(mediaRes.headers.get("content-type") || "");
      assert.ok(ct.includes("image"), `expected image content-type, got ${ct}`);
      assert.equal(String(mediaRes.headers.get("accept-ranges") || "").toLowerCase(), "bytes");
      const totalLen = MIN_PNG.length;
      assert.equal(Number(mediaRes.headers.get("content-length")), totalLen);
      const buf = Buffer.from(await mediaRes.arrayBuffer());
      assert.equal(buf.length, totalLen);
      assert.equal(buf.compare(MIN_PNG), 0);

      const cdInline = String(mediaRes.headers.get("content-disposition") || "");
      assert.ok(/inline/i.test(cdInline), cdInline);
      assert.ok(/filename=/i.test(cdInline), cdInline);
      assert.ok(/e2e\.png/i.test(cdInline), cdInline);

      const mediaDl = await fetch(`${baseUrl}/scan/${scanId}/media?download=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(mediaDl.status, 200);
      const cdAtt = String(mediaDl.headers.get("content-disposition") || "");
      assert.ok(/attachment/i.test(cdAtt), cdAtt);
      assert.ok(/filename=/i.test(cdAtt), cdAtt);
      const dlBuf = Buffer.from(await mediaDl.arrayBuffer());
      assert.equal(dlBuf.length, totalLen);
      assert.equal(dlBuf.compare(MIN_PNG), 0);

      const r206 = await fetch(`${baseUrl}/scan/${scanId}/media`, {
        headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-3" }
      });
      assert.equal(r206.status, 206);
      assert.equal(r206.headers.get("content-length"), "4");
      const cr = String(r206.headers.get("content-range") || "");
      assert.ok(cr.startsWith(`bytes 0-3/${totalLen}`), cr);
      const partial = Buffer.from(await r206.arrayBuffer());
      assert.equal(partial.length, 4);
      assert.equal(partial.compare(MIN_PNG, 0, 4, 0, 4), 0);

      const r416 = await fetch(`${baseUrl}/scan/${scanId}/media`, {
        headers: { Authorization: `Bearer ${token}`, Range: `bytes=${totalLen + 10}-${totalLen + 20}` }
      });
      assert.equal(r416.status, 416);
      assert.equal(String(r416.headers.get("content-range") || ""), `bytes */${totalLen}`);

      await pool.query(`UPDATE scans SET file_size_bytes = $2 WHERE id = $1`, [scanId, 26 * 1024 * 1024]);
      const r413 = await fetchJson(`${baseUrl}/scan/${scanId}/media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(r413.res.status, 413);
      assert.equal(r413.body.error, "Media preview is too large to stream");
      await pool.query(`UPDATE scans SET file_size_bytes = $2 WHERE id = $1`, [scanId, totalLen]);
    });
  });
});
