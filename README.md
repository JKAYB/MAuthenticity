# media-auth-saas

Monorepo for **MAuthenticity**: an API + worker + web app for media authenticity scans. Users submit **file uploads** or **URLs**; a **BullMQ** worker runs a **detection provider** (`mock` or `real` HTTP) and persists results in **Postgres**.

**Detailed operations, env tables, runbooks, and troubleshooting:** [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)

---

## Repository layout

| Package | Responsibility |
|---------|------------------|
| **`apps/api`** | Express API: JWT auth, `POST/GET /scan…`, enqueues jobs on queue **`scan-jobs`**, persists uploads via **`@media-auth/scan-storage`** (`local` or **`s3`**), optional **`/internal/scans`** ops API. |
| **`apps/worker`** | BullMQ worker: loads scan + media (local path or temp file from S3), runs provider, updates `scans`. |
| **`apps/web`** | Vite + React SPA: user dashboard and scan UI; optional **internal ops** page at **`/internal/scans`**. |
| **`packages/scan-storage`** | Shared upload backend: **`OBJECT_STORAGE_PROVIDER`** `local` \| `s3` (GCS scaffold fails fast). |

---

## Quick start (local)

**Prerequisites:** Node 20+ (LTS recommended), Postgres, Redis — **or** Docker for infra only (see below).

**Typical flows**

| | Steps |
|---|--------|
| **First time** | `npm run dev:check` → `npm run docker:up` (if using Compose) → `npm run db:migrate` → **`npm run dev`** |
| **Later** | `npm run docker:up` (when you need infra) → **`npm run dev`** |

`npm run dev` does **not** start Docker or run migrations; keep those separate as above. Use **`dev:api` / `dev:worker` / `dev:web`** when you want one service in its own terminal.

1. **Clone** and install: `npm install` (repo root; workspaces).

2. **Environment:** create a **repo root** `.env` (API and worker load `../../../.env` from their `src`). Minimum:

   - `DATABASE_URL`
   - `REDIS_URL` (optional; defaults to localhost Redis)
   - `JWT_SECRET` (do not use `change-me` outside local dev)

   For **Docker-backed Postgres + Redis + MinIO**, copy values from **`.env.docker.example`** after `npm run docker:up` (see [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) §5.1). Web vars such as **`VITE_API_BASE_URL`** live in `apps/web/.env` or your shell — see `apps/web/.env.example`.

3. **Database:** `npm run db:migrate`

4. **Run apps** (repo root `.env` for API/worker):

   | Mode | Command |
   |------|---------|
   | **All at once (recommended)** | **`npm run dev`** — API + worker + web with prefixed, colorized logs; **Ctrl+C** stops all three. Same as `npm run dev:all`. |
   | Separate terminals | `npm run dev:api`, `npm run dev:worker`, `npm run dev:web` |

   URLs: [http://localhost:4000](http://localhost:4000) (API), [http://localhost:5173](http://localhost:5173) (web).

**Suggested order:** Postgres → Redis → migrate → **`npm run dev`** (or three `dev:*` terminals). Without the worker, scans stay **`pending`**. **`npm run dev` does not start Docker** — run **`npm run docker:up`** first when using Compose infra.

### First-time setup check

Run **`npm run dev:check`** (read-only): Node (warns if major version is under 18), Docker / Compose CLI, `.env` presence, **`DATABASE_URL`** / **`JWT_SECRET`**, Redis note, S3 vars only when **`OBJECT_STORAGE_PROVIDER=s3`**, optional ops/Vite vars, and common mistakes (e.g. **`http://minio:9000`** in **`OBJECT_STORAGE_ENDPOINT`** on the host). Prints suggested **`docker:up`**, **`db:migrate`**, and **`npm run dev`** (or individual **`dev:*`**) commands. Does not install packages or start Docker.

### Local infra with Docker (optional)

Infra only — apps still run via npm on the host:

```bash
npm run docker:up          # Postgres, Redis, MinIO + bucket init
npm run db:migrate         # after first up (or after docker:reset)
# merge .env.docker.example into .env if you use MinIO for uploads (OBJECT_STORAGE_PROVIDER=s3)
npm run dev                # API + worker + web (or use dev:api / dev:worker / dev:web separately)
```

- **`npm run docker:down`** — stop containers. **`npm run docker:reset`** — remove volumes and start clean (wipes DB/Redis/MinIO data for this compose project).
- MinIO console: **http://127.0.0.1:9001** (user `minio`, password `minio12345` in compose — dev only).
- Details, ports, and pitfalls: **OPERATIONS §5.1**.

**Health checks (API):**

- `GET /health` — process is up.
- `GET /ready` — **200** if Postgres and Redis respond; **503** with `{ ok, database, redis }` if not.

**Real provider config check (worker env):** `npm run real-provider:check`

---

## Scan lifecycle (high level)

1. Authenticated client **`POST /scan`** → row `status=pending`, job **`scan-media`** with `jobId = scan.id`.
2. Worker consumes job → `processing` → provider → `completed` or `failed` (`error_message`, `summary`, `detection_provider`, etc.).
3. Dashboard charts: **`GET /scan/analytics/activity`** and **`GET /scan/analytics/detection-mix`** (JWT) — see [`docs/OPERATIONS.md`](./docs/OPERATIONS.md#21-dashboard-analytics-authenticated-user).

Queue name: **`scan-jobs`**. API and worker **must** share the same **`REDIS_URL`**.

---

## Recent product updates (web)

- **Aggregated verdict layer:** scan result rendering now uses a dedicated adapter (`apps/web/src/features/scans/adapters/aggregateScanResult.ts`) that combines provider outputs into a single top-level verdict, confidence, agreement signal, reasons, and cleaned top signals.
- **Provider-aware normalization:** Hive and Reality Defender inputs are normalized with provider-specific score conversion rules (probability vs already-percent fields), noise filtering, model/label mapping, and safer fallback handling.
- **Scan detail UX split:** top card now reflects the **aggregated** decision (title/summary/confidence/reasons), while provider tabs remain unchanged for advanced inspection (metadata, provider signals, model insights, heatmaps, artifacts, timeline, raw output).
- **Scans history alignment:** list rows now display status/confidence derived from the same aggregation adapter for consistency between history and detail views.
- **Theme consistency:** shared Select primitives were updated to use app theme tokens for trigger/content/item states across light and dark mode.
- **Layout stability:** app shell/sidebar behavior was tightened to reduce unnecessary nav animation replays on query-param-only page updates (e.g., scan history filter/pagination changes).

---

## Provider modes

| Mode | Env | Notes |
|------|-----|--------|
| **Mock** | `DETECTION_PROVIDER=mock` (default) | No external HTTP; good for dev and CI. |
| **Real** | `DETECTION_PROVIDER=real` | **Generic:** **`DETECTION_REAL_URL`** (+ optional **`DETECTION_REAL_API_KEY`**). **Reality Defender:** **`DETECTION_REAL_VENDOR=reality_defender`** + **`REALITY_DEFENDER_API_KEY`** (upload + image MVP) — see **§7** in [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) and the [official TS SDK](https://github.com/Reality-Defender/realitydefender-sdk-typescript). |

---

## Internal operations (API + web)

- **API:** If **`INTERNAL_OPS_TOKEN`** is set, routes under **`/internal/scans`** accept **`X-Internal-Token`** (or `Authorization: Internal …`). If unset, those paths respond **404** (not advertised).
- **Web:** If **`VITE_INTERNAL_OPS_TOKEN`** is set **at build time**, the SPA exposes **`/internal/scans`** (operator UI). It is **not** linked from the normal app shell. The value must **match** the API token; it is **inlined in the client bundle** — private/internal deploys only.

Route summary: list/filter scans, stuck listing, counts, detail, **`POST …/retry`**, **`POST …/reset-stuck`**. See [`docs/OPERATIONS.md`](./docs/OPERATIONS.md#8-internal-ops-api--web) and `apps/api/src/routes/scanAdmin.routes.js`.

---

## Upload storage

Uploads use **`storage_key`** + **`storage_provider`** in Postgres (queue payload stays `{ scanId, userId }`). Default **`OBJECT_STORAGE_PROVIDER=local`** writes under **`<repo>/data/scan-uploads`** (override with **`SCAN_STORAGE_LOCAL_DIR`** on API and worker). Set **`OBJECT_STORAGE_PROVIDER=s3`** plus bucket/region/credentials for S3 or MinIO — see [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) (§4.6–4.7). Validate with **`npm run object-storage:check`**. To **copy existing local-backed rows to S3** and flip `storage_provider` (without deleting local files), use **`npm run migrate:local-uploads-to-s3:dry-run`** then **`npm run migrate:local-uploads-to-s3`** (OPERATIONS §4.7). Afterward, **`npm run audit:scan-upload-storage`** (and **`with-s3`** when you have bucket credentials) per §4.8; **`npm run cleanup:local-upload-files:dry-run`** proposes safe legacy **`unlink`** for S3-backed rows only (**`cleanup:local-upload-files`** runs **`--execute`**).

---

## Root npm scripts

| Script | Purpose |
|--------|---------|
| `dev:check` | Validate tools + `.env` + common mistakes; print startup hints (no installs, no `docker up`) |
| `dev` / `dev:all` | Start **api + worker + web** together ([`concurrently`](https://www.npmjs.com/package/concurrently)); prefixed logs; **Ctrl+C** stops all children |
| `dev:api` / `dev:worker` / `dev:web` | Development servers (individual; unchanged) |
| `worker` | Production-style worker start |
| `docker:up` / `docker:infra:up` | Start Compose infra (Postgres, Redis, MinIO + bucket) |
| `docker:down` | Stop Compose services |
| `docker:logs` | `docker compose logs -f` |
| `docker:reset` | `down -v` then `up` (clears named volumes) |
| `db:migrate` | Run API migrations (`dotenv` loads root `.env`) |
| `real-provider:check` | Validate `DETECTION_PROVIDER=real` env |
| `object-storage:check` | Validate `OBJECT_STORAGE_PROVIDER` + S3 env (`@media-auth/scan-storage`) |
| `migrate:local-uploads-to-s3` | Ops: copy legacy local upload files to S3 + update `scans` (see OPERATIONS §4.7) |
| `migrate:local-uploads-to-s3:dry-run` | Same, dry-run (no S3/DB writes) |
| `audit:scan-upload-storage` | Ops: audit upload rows + orphan files (see OPERATIONS §4.8) |
| `audit:scan-upload-storage:with-s3` | Adds `--check-s3 --check-local` (needs S3 env) |
| `audit:scan-upload-storage:json` | Machine-readable summary (`--json`) |
| `cleanup:local-upload-files:dry-run` | Proposes legacy local file deletes for S3-backed rows only |
| `cleanup:local-upload-files` | **`--execute`** — performs those unlinks (still no S3/DB changes) |
| `test:worker` | Worker unit tests |
| `test:integration:worker` | Worker integration (`RUN_SCAN_INTEGRATION=1`) |
| `test:integration:api` | API integration (`RUN_API_INTEGRATION`, DB, Redis) |
| `test:scan-storage:s3` | Optional S3/MinIO tests (`RUN_S3_INTEGRATION=1` + bucket/credentials in `.env`) |
| `test:integration:api:s3` | Optional API→worker upload on S3 (`RUN_API_S3_STORAGE_INTEGRATION` + DB/Redis/S3; see OPERATIONS §11.1) |

Workspace-specific scripts: see `apps/api/package.json`, `apps/worker/package.json`, `apps/web/package.json`.

---

## Documentation index

| Doc | Contents |
|-----|----------|
| [**docs/OPERATIONS.md**](./docs/OPERATIONS.md) | Env reference, **Docker Compose (§5.1)**, startup, runbooks, real provider, troubleshooting, `retry_count` vs BullMQ |

---

## Gaps (by design / future)

- No in-repo Docker Compose; operators supply Postgres/Redis.
- Internal ops is **token-based**, not full enterprise RBAC.
- Real provider integration is **tested and configurable** but not a full production SRE story (no circuit breaker, etc.) — see **OPERATIONS** caveats.
