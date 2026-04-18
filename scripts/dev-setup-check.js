#!/usr/bin/env node
/**
 * First-time / local dev sanity check: tools, .env, key variables, common mistakes.
 * Does not install packages, start Docker, or change system state.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(REPO_ROOT, ".env");
const EXAMPLE_ENV = path.join(REPO_ROOT, ".env.docker.example");

function section(title) {
  process.stdout.write(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}\n`);
}

function line(icon, msg) {
  process.stdout.write(`${icon}  ${msg}\n`);
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** @returns {Record<string, string> | null} */
function parseDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      continue;
    }
    const eq = t.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseNodeMajor() {
  const m = /^v(\d+)/.exec(process.version || "");
  return m ? parseInt(m[1], 10) : 0;
}

function main() {
  let exitCode = 0;
  const critical = [];

  section("Tools");
  const nodeMajor = parseNodeMajor();
  if (nodeMajor >= 18) {
    line("[ok]", `Node ${process.version} (>= 18)`);
  } else {
    line("[!!]", `Node ${process.version} — recommend Node 18+ (LTS). Current major: ${nodeMajor}`);
  }

  const dockerV = tryExec("docker --version");
  if (dockerV) {
    line("[ok]", dockerV);
  } else {
    line("[--]", "Docker CLI not found — install Docker Desktop (or Docker Engine) to use `npm run docker:up`.");
  }

  const composeV = tryExec("docker compose version");
  if (composeV) {
    line("[ok]", composeV);
  } else {
    const legacy = tryExec("docker-compose --version");
    if (legacy) {
      line("[ok]", `${legacy} (legacy docker-compose)`);
    } else {
      line("[--]", "`docker compose` not found — use Docker Compose V2 plugin or install `docker-compose`.");
    }
  }

  section("Environment file");
  if (!fs.existsSync(ENV_PATH)) {
    line("[!!]", `Missing ${path.relative(REPO_ROOT, ENV_PATH)}`);
    if (fs.existsSync(EXAMPLE_ENV)) {
      line("    ", `Copy example:  cp .env.docker.example .env`);
      line("    ", "Then edit `.env` (JWT_SECRET, etc.).");
    } else {
      line("    ", "Create a root `.env` with DATABASE_URL, REDIS_URL, JWT_SECRET, and storage vars (see README).");
    }
    critical.push("no .env");
  } else {
    line("[ok]", `.env present (${path.relative(REPO_ROOT, ENV_PATH)})`);
  }

  /** @type {Record<string, string>} */
  let env = {};
  const envFileOk = fs.existsSync(ENV_PATH);
  if (envFileOk) {
    env = parseDotEnvFile(ENV_PATH) || {};
  }

  function has(k) {
    const v = env[k];
    return v != null && String(v).trim() !== "";
  }

  if (envFileOk) {
    section("Variables (.env)");

    const requiredAlways = ["DATABASE_URL", "JWT_SECRET"];
    for (const k of requiredAlways) {
      if (has(k)) {
        line("[ok]", k);
      } else {
        line("[!!]", `${k} missing or empty`);
        critical.push(`missing ${k}`);
      }
    }

    if (has("REDIS_URL")) {
      line("[ok]", "REDIS_URL");
    } else {
      line("[--]", "REDIS_URL not set — API/worker default to redis://127.0.0.1:6379 (OK if Compose Redis is on 6379).");
    }

    const provider = (env.OBJECT_STORAGE_PROVIDER || "local").trim().toLowerCase();
    line("[..]", `OBJECT_STORAGE_PROVIDER → ${has("OBJECT_STORAGE_PROVIDER") ? provider : "(unset, treated as local)"}`);

    if (provider === "s3") {
      const required = [
        "OBJECT_STORAGE_BUCKET",
        "OBJECT_STORAGE_REGION",
        "OBJECT_STORAGE_ACCESS_KEY_ID",
        "OBJECT_STORAGE_SECRET_ACCESS_KEY"
      ];

      for (const k of required) {
        if (has(k)) {
          line("[ok]", k);
        } else {
          line("[!!]", `${k} missing (required when OBJECT_STORAGE_PROVIDER=s3)`);
          critical.push(`missing ${k}`);
        }
      }

      // Endpoint is OPTIONAL (only for MinIO / custom S3)
      if (has("OBJECT_STORAGE_ENDPOINT")) {
        line("[ok]", "OBJECT_STORAGE_ENDPOINT (custom S3 / MinIO)");
      } else {
        line("[ok]", "OBJECT_STORAGE_ENDPOINT not set (using AWS S3 default)");
      }

      if (has("OBJECT_STORAGE_FORCE_PATH_STYLE")) {
        line("[ok]", "OBJECT_STORAGE_FORCE_PATH_STYLE");
      } else {
        line("[--]", "OBJECT_STORAGE_FORCE_PATH_STYLE only needed for MinIO / custom S3");
      }
    } else if (provider === "local") {
      line("[ok]", "S3-specific vars not required for local disk storage.");
    } else {
      line("[!!]", `OBJECT_STORAGE_PROVIDER="${provider}" — use local or s3`);
      critical.push("bad OBJECT_STORAGE_PROVIDER");
    }

    const optional = [
      ["INTERNAL_OPS_TOKEN", "Enables /internal/scans on the API when set."],
      ["VITE_API_BASE_URL", "Web → API origin (e.g. http://localhost:4000)."],
      ["VITE_INTERNAL_OPS_TOKEN", "Build-time; must match INTERNAL_OPS_TOKEN for ops UI."]
    ];
    for (const [k, hint] of optional) {
      if (has(k)) {
        line("[ok]", `${k}`);
      } else {
        line("[--]", `${k} not set — ${hint}`);
      }
    }

    section("Common mistakes");
    const endpoint = env.OBJECT_STORAGE_ENDPOINT && String(env.OBJECT_STORAGE_ENDPOINT).trim();
    if (endpoint && /minio:9000/i.test(endpoint)) {
      line(
        "[!!]",
        "OBJECT_STORAGE_ENDPOINT looks like a Docker hostname (http://minio:9000). On the host, use http://127.0.0.1:9000 (see OPERATIONS §5.1)."
      );
      critical.push("bad OBJECT_STORAGE_ENDPOINT for host");
    } else if (provider === "s3" && endpoint) {
      line("[ok]", "OBJECT_STORAGE_ENDPOINT does not use in-compose-only hostname `minio:9000`.");
    } else {
      line("[..]", "OBJECT_STORAGE_ENDPOINT / MinIO host check skipped (not using S3 or endpoint unset).");
    }
  } else {
    section("Variables (.env)");
    line("[--]", "Skipped until `.env` exists.");
  }

  section("Summary");
  if (critical.length === 0) {
    line("[ok]", "No critical blockers detected for a typical host + Docker infra setup.");
    process.stdout.write(`
You're ready to start the dev stack

  Start infra:
    npm run docker:up

  Run DB migrations:
    npm run db:migrate

  Start apps together (one terminal; Ctrl+C stops all; same as dev:api/worker/web):
    npm run dev

  Or run API, worker, and web in separate terminals:
    npm run dev:api
    npm run dev:worker
    npm run dev:web

  Useful URLs:
    API health:  http://localhost:4000/health
    API ready:   http://localhost:4000/ready
    Web:         http://localhost:5173
    MinIO UI:    http://127.0.0.1:9001

  Optional checks:
    npm run object-storage:check
    npm run real-provider:check
`);
  } else {
    line("[!!]", `Critical: ${critical.join("; ")}`);
    process.stdout.write("\nFix the items above, then run this script again.\n\n");
    exitCode = 1;
  }

  process.exit(exitCode);
}

main();
