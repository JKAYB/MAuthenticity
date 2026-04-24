/**
 * Internal scan ops API (list/retry/stuck/reset). Requires RUN_API_INTEGRATION=1, DATABASE_URL, REDIS_URL.
 * Set INTERNAL_OPS_TOKEN for these routes (middleware returns 404 when unset).
 */

"use strict";

const path = require("path");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

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

const d = apiIntegrationEnabled ? describe : describe.skip;

const TEST_OPS_TOKEN = "integration-internal-ops-token-xxxxxxxx";

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
  assert.equal(r.res.status, 201, `signup: ${JSON.stringify(r.body)}`);
  r = await fetchJson(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(r.res.status, 200, `login: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

function opsHeaders(token = TEST_OPS_TOKEN) {
  return { "X-Internal-Token": token };
}

d("internal scan admin API", () => {
  let baseUrl;
  let closeServer;
  /** @type {import('pg').Pool} */
  let pool;
  let prevInternalToken;
  let savedObjectStorageProvider;
  const createdUserIds = [];
  const createdScanIds = [];

  before(async () => {
    process.env.DETECTION_PROVIDER = process.env.DETECTION_PROVIDER || "mock";
    delete process.env.DETECTION_REAL_URL;
    savedObjectStorageProvider = process.env.OBJECT_STORAGE_PROVIDER;
    process.env.OBJECT_STORAGE_PROVIDER = "local";
    delete process.env.OBJECT_STORAGE_BUCKET;
    prevInternalToken = process.env.INTERNAL_OPS_TOKEN;
    process.env.INTERNAL_OPS_TOKEN = TEST_OPS_TOKEN;

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
    if (prevInternalToken === undefined) {
      delete process.env.INTERNAL_OPS_TOKEN;
    } else {
      process.env.INTERNAL_OPS_TOKEN = prevInternalToken;
    }
    if (savedObjectStorageProvider === undefined) {
      delete process.env.OBJECT_STORAGE_PROVIDER;
    } else {
      process.env.OBJECT_STORAGE_PROVIDER = savedObjectStorageProvider;
    }
  });

  it("rejects wrong internal token with 403", async () => {
    const { res } = await fetchJson(`${baseUrl}/internal/scans?status=failed&limit=1`, {
      headers: { "X-Internal-Token": "wrong-token" }
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when INTERNAL_OPS_TOKEN is unset (disabled)", async () => {
    process.env.INTERNAL_OPS_TOKEN = "";
    const { res } = await fetchJson(`${baseUrl}/internal/scans?limit=1`, {
      headers: { "X-Internal-Token": TEST_OPS_TOKEN }
    });
    assert.equal(res.status, 404);
    process.env.INTERNAL_OPS_TOKEN = TEST_OPS_TOKEN;
  });

  it("lists failed scans and supports counts-by-status", async () => {
    const email = `adm-${crypto.randomBytes(6).toString("hex")}@t.local`;
    await signupLogin(baseUrl, email, "TestUser1!");
    const uid = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(uid);

    const scanId = uuidv4();
    createdScanIds.push(scanId);
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, error_message, summary, completed_at)
       VALUES ($1, $2, 'x.png', 'image/png', 10, 'failed', 'upload', 'detector blew up', NULL, NOW())`,
      [scanId, uid]
    );

    const list = await fetchJson(`${baseUrl}/internal/scans?status=failed&limit=50`, {
      headers: opsHeaders()
    });
    assert.equal(list.res.status, 200);
    assert.ok(list.body.data.some((r) => r.id === scanId));
    assert.ok(list.body.data.find((r) => r.id === scanId).error_message.includes("detector"));

    const counts = await fetchJson(`${baseUrl}/internal/scans/counts-by-status`, {
      headers: opsHeaders()
    });
    assert.equal(counts.res.status, 200);
    assert.ok(typeof counts.body.byStatus.failed === "number");
  });

  it("retries failed scan: pending row, cleared error, re-enqueued job", async () => {
    const email = `r-${crypto.randomBytes(6).toString("hex")}@t.local`;
    await signupLogin(baseUrl, email, "TestUser1!");
    const uid = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(uid);

    const scanId = uuidv4();
    createdScanIds.push(scanId);
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, error_message, completed_at)
       VALUES ($1, $2, 'y.png', 'image/png', 10, 'failed', 'upload', 'bad', NOW())`,
      [scanId, uid]
    );

    const { Queue } = require("bullmq");
    const { connection } = require("../../src/db/redis");
    const q = new Queue("scan-jobs", { connection });
    try {
      const stale = await q.getJob(scanId);
      if (stale) {
        await stale.remove();
      }
    } finally {
      await q.close();
    }

    const retry = await fetchJson(`${baseUrl}/internal/scans/${scanId}/retry`, {
      method: "POST",
      headers: opsHeaders()
    });
    assert.equal(retry.res.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.scan.status, "pending");
    assert.equal(retry.body.scan.error_message, null);
    assert.ok(Number(retry.body.scan.retry_count) >= 1);

    const { rows } = await pool.query(`SELECT status, error_message, retry_count FROM scans WHERE id = $1`, [scanId]);
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[0].error_message, null);

    const q2 = new Queue("scan-jobs", { connection });
    try {
      const job = await q2.getJob(scanId);
      assert.ok(job, "job should exist after retry");
      const st = await job.getState();
      assert.ok(["waiting", "delayed", "active", "completed"].includes(st));
      assert.deepEqual(job.data, { scanId, userId: uid });
    } finally {
      await q2.close();
    }
  });

  it("rejects retry for processing and completed (without flag)", async () => {
    const email = `p-${crypto.randomBytes(6).toString("hex")}@t.local`;
    await signupLogin(baseUrl, email, "TestUser1!");
    const uid = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(uid);

    const procId = uuidv4();
    const doneId = uuidv4();
    createdScanIds.push(procId, doneId);

    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type)
       VALUES ($1, $2, 'p.png', 'image/png', 1, 'processing', 'upload')`,
      [procId, uid]
    );
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, summary, completed_at)
       VALUES ($1, $2, 'd.png', 'image/png', 1, 'completed', 'upload', 'ok', NOW())`,
      [doneId, uid]
    );

    const r1 = await fetchJson(`${baseUrl}/internal/scans/${procId}/retry`, {
      method: "POST",
      headers: opsHeaders()
    });
    assert.equal(r1.res.status, 409);

    const r2 = await fetchJson(`${baseUrl}/internal/scans/${doneId}/retry`, {
      method: "POST",
      headers: opsHeaders()
    });
    assert.equal(r2.res.status, 409);
  });

  it("lists stuck processing scans by stale threshold", async () => {
    const email = `s-${crypto.randomBytes(6).toString("hex")}@t.local`;
    await signupLogin(baseUrl, email, "TestUser1!");
    const uid = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(uid);

    const stuckId = uuidv4();
    createdScanIds.push(stuckId);
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, updated_at, completed_at)
       VALUES ($1, $2, 's.png', 'image/png', 1, 'processing', 'upload', NOW() - INTERVAL '2 hours', NULL)`,
      [stuckId, uid]
    );

    const stuck = await fetchJson(`${baseUrl}/internal/scans/stuck?minutes=30`, {
      headers: opsHeaders()
    });
    assert.equal(stuck.res.status, 200);
    assert.ok(stuck.body.data.some((r) => r.id === stuckId));
  });

  it("reset-stuck returns 404 when processing scan is not stale enough", async () => {
    const email = `fresh-${crypto.randomBytes(6).toString("hex")}@t.local`;
    await signupLogin(baseUrl, email, "TestUser1!");
    const uid = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(uid);

    const scanId = uuidv4();
    createdScanIds.push(scanId);
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, updated_at, completed_at)
       VALUES ($1, $2, 'n.png', 'image/png', 1, 'processing', 'upload', NOW(), NULL)`,
      [scanId, uid]
    );

    const reset = await fetchJson(`${baseUrl}/internal/scans/${scanId}/reset-stuck?minutes=60`, {
      method: "POST",
      headers: opsHeaders()
    });
    assert.equal(reset.res.status, 404);
  });

  it("reset-stuck moves stale processing scan to pending and re-enqueues", async () => {
    const email = `z-${crypto.randomBytes(6).toString("hex")}@t.local`;
    await signupLogin(baseUrl, email, "TestUser1!");
    const uid = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(uid);

    const scanId = uuidv4();
    createdScanIds.push(scanId);
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, updated_at, completed_at)
       VALUES ($1, $2, 'z.png', 'image/png', 1, 'processing', 'upload', NOW() - INTERVAL '3 hours', NULL)`,
      [scanId, uid]
    );

    const { Queue } = require("bullmq");
    const { connection } = require("../../src/db/redis");
    const q0 = new Queue("scan-jobs", { connection });
    try {
      const j = await q0.getJob(scanId);
      if (j) {
        await j.remove();
      }
    } finally {
      await q0.close();
    }

    const reset = await fetchJson(`${baseUrl}/internal/scans/${scanId}/reset-stuck?minutes=30`, {
      method: "POST",
      headers: { ...opsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(reset.res.status, 200, JSON.stringify(reset.body));
    assert.equal(reset.body.scan.status, "pending");

    const q2 = new Queue("scan-jobs", { connection });
    try {
      const job = await q2.getJob(scanId);
      assert.ok(job);
    } finally {
      await q2.close();
    }
  });

  it("user scan history is unchanged and does not require internal token", async () => {
    const email = `u-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    await signupLogin(baseUrl, email, password);
    const uid = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(uid);
    const login = await fetchJson(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.res.status, 200, `login: ${JSON.stringify(login.body)}`);
    const setCookie = login.res.headers.get("set-cookie");
    assert.ok(setCookie && setCookie.includes("auth_token="), "missing auth_token cookie");
    const authCookie = setCookie.split(";")[0];

    const hist = await fetchJson(`${baseUrl}/scan/history`, {
      headers: { Cookie: authCookie }
    });
    assert.equal(hist.res.status, 200);
    assert.ok(Array.isArray(hist.body.data));
  });

  it("rejects invalid scan id on internal detail", async () => {
    const { res } = await fetchJson(`${baseUrl}/internal/scans/not-a-uuid`, {
      headers: opsHeaders()
    });
    assert.equal(res.status, 400);
  });

  it("allows retry of completed scan when allow_completed=1", async () => {
    const email = `c-${crypto.randomBytes(6).toString("hex")}@t.local`;
    await signupLogin(baseUrl, email, "TestUser1!");
    const uid = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(uid);

    const scanId = uuidv4();
    createdScanIds.push(scanId);
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status, source_type, summary, detection_provider, completed_at)
       VALUES ($1, $2, 'c.png', 'image/png', 1, 'completed', 'upload', 'done', 'mock', NOW())`,
      [scanId, uid]
    );

    const { Queue } = require("bullmq");
    const { connection } = require("../../src/db/redis");
    const q0 = new Queue("scan-jobs", { connection });
    try {
      const j = await q0.getJob(scanId);
      if (j) {
        await j.remove();
      }
    } finally {
      await q0.close();
    }

    const retry = await fetchJson(`${baseUrl}/internal/scans/${scanId}/retry?allow_completed=1`, {
      method: "POST",
      headers: opsHeaders()
    });
    assert.equal(retry.res.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.scan.status, "pending");
  });
});
