# Observyx — Internal Product & Engineering Documentation

This document describes **Observyx** as implemented in this repository: architecture, scan lifecycle, strengths, risks, and planning context. It is written for builders, future contributors, technical reviewers, and roadmap discussions. Where behavior is inferred from code rather than product specs, that is called out.

For day-to-day env vars, runbooks, and operations, see **[`docs/OPERATIONS.md`](./docs/OPERATIONS.md)** and the root **[`README.md`](./README.md)**.

---

## 1. Project Overview

### What Observyx is

**Observyx** is a SaaS-style application for **media authenticity analysis**: users authenticate, submit **file uploads** or **URLs**, and receive **structured scan results** (confidence, AI-generation signal where applicable, summary, and provider-specific detail) backed by **Postgres** and optional **object storage** (local filesystem or S3-compatible).

### Problem it addresses

Teams need a **repeatable way** to run authenticity / manipulation-oriented checks on **media** (the **Reality Defender** integration path in this repo is built around **image** upload/analysis; other media types and URL depth depend on provider capabilities and your configuration) **without building and maintaining** their own provider integrations, storage pipeline, and job orchestration from scratch.

### Core value proposition

- **End-to-end scan flow**: authenticated API + web UI from upload/URL → persisted scan row → detection → history and detail views.
- **Provider-backed analysis**: pluggable detection layer (`mock` for dev/CI; `real` with generic HTTP or **Reality Defender** vendor path) with **normalized** outputs before persistence.
- **Operational flexibility**: **queue + worker** path (BullMQ / Redis) or **direct** execution inside the API process to reduce moving parts and cost when appropriate.
- **Storage abstraction**: shared **`@media-auth/scan-storage`** package for **local** or **S3** uploads, with scripts for migration and audit (see README).

### Current maturity (grounded)

| Area | State (as of this codebase) |
|------|-----------------------------|
| Monorepo | Stable workspaces: `apps/api`, `apps/worker`, `apps/web`, `packages/scan-storage`. |
| Auth | HttpOnly cookie auth (`auth_token`) for web sessions, signup/login/logout, `/me` profile and password change; API keys supported with masked key listing and one-time full key on creation. |
| Scans | Create from upload or URL; statuses `pending` → `processing` → `completed` / `failed`; scan history supports backend `mediaType` filtering (`image`/`video`/`audio`/`document`/`other`). |
| Detection | **Mock** and **real** providers; **Reality Defender** integration path with normalization contract (`isAiGenerated` nullable for inconclusive outcomes). |
| Frontend | Vite + React (TanStack Router); dashboard, scan flow, scan detail with authenticated media preview, heatmap/artifact streaming, and report export support. |
| Marketing | Landing, how-it-works, shared marketing header patterns. |
| Deploy | README references Netlify in CORS allowlist example; **production posture** (hosting, secrets, SLAs) is environment-specific—not fully encoded in-repo. |

This is a **working product foundation**, not a complete enterprise compliance platform unless you extend it as such.

---

## 2. Current Architecture

### Monorepo layout

| Path | Responsibility |
|------|----------------|
| **`apps/api`** | **Express** API: CORS + credentials, cookie parser, JSON body, **`/auth`**, **`/scan`**, **`/me`**, **`/internal/scans`** (token-gated ops). Web auth is cookie-based (`auth_token`) and private routes apply no-store cache headers. Enqueues BullMQ jobs or runs **`processScanById`** inline when **`SCAN_EXECUTION_MODE=direct`**. Uses **`@media-auth/scan-storage`** for uploads and derived assets. **`/ready`** checks Postgres and Redis (Redis skipped when direct mode). |
| **`apps/worker`** | **BullMQ** worker on queue **`scan-jobs`**: runs the **same** `processScanById` pipeline as direct mode—resolve media from DB/storage, **`runDetection`**, mark completed/failed. Concurrency and optional rate limiting via env. |
| **`apps/web`** | **SPA**: authenticated app shell (dashboard, scans list, scan detail, upload flow, notifications, settings), marketing routes, login/signup using **`AuthShell`**. Browser-side internal ops calls are intentionally disabled; internal ops endpoints are backend-only. |
| **`packages/scan-storage`** | **Factory**-based storage: **`OBJECT_STORAGE_PROVIDER`** `local` \| `s3`; validation, key helpers, CLI **`storage:check`**, tests including optional MinIO integration. |

### Scan lifecycle (upload → result)

High-level flow (queue mode; direct mode collapses steps 2–3 into the API process):

1. **Client** (web or API consumer) authenticates and **`POST /scan`** (multipart upload) or URL submission as implemented in **`scan.routes.js`** / **`scan.service.js`**.
2. **API** creates a **`scans`** row (e.g. `pending`), stores media via **scan-storage** (`storage_key`, `storage_provider`), then **`dispatchScanAfterInsert`**:
   - **`queue`**: adds BullMQ job **`scan-media`** with payload **`{ scanId, userId }`** (job id aligned with scan id per implementation).
   - **`direct`**: calls **`processScanById`** from the worker package in-process (requires object storage readiness checks in API).
3. **Worker** (or API in direct mode) loads the scan row, **resolves media** to a local path or temp file (S3 download when applicable), runs **`runDetection`**:
   - Resolves **active provider** (`DETECTION_PROVIDER`), calls **`provider.detect`**, then **`normalizeProviderResult`** and **`buildResultPayload`**.
4. **Persistence**: `completed` with confidence, `is_ai_generated` (nullable), summary, **`result_payload`**, **`detection_provider`**; or `failed` with **`error_message`**.

**URL-sourced scans** follow the same orchestration after the row represents the URL source (see scan service / controller implementation).

### Direct mode vs queue / worker mode

| Mode | Env | Behavior |
|------|-----|----------|
| **`queue`** (default) | `SCAN_EXECUTION_MODE` unset or not `direct` | API enqueues Redis/BullMQ job; **worker must run** or scans remain **`pending`**. |
| **`direct`** | `SCAN_EXECUTION_MODE=direct` | API runs **`processScanById`** synchronously after insert; **no Redis required** for scan execution path; `/ready` treats Redis as skipped for that check. |

**Tradeoff:** direct mode avoids queue infrastructure cost and simplifies small deployments; it ties **request duration and API process capacity** to provider latency and file size.

### Storage design (summary)

- **Postgres** holds scan metadata, JSON **`result_payload`**, storage pointers, status, errors, retry counts, etc. (see **`apps/api/src/db/migrate.js`**).
- **Blobs** live under **`storage_key`** + **`storage_provider`**, abstracted by **`@media-auth/scan-storage`** (local dir or S3).
- **Repo scripts** support dry-run / execute migration from local to S3, audits, and safe cleanup of orphaned local files (README + OPERATIONS).

### Deployment-level overview

- **API** listens on **`PORT`** (default 4000); **web** is a static/Vite app with **`VITE_API_BASE_URL`** pointing at the API.
- **CORS** is configured with `credentials: true` and an explicit allowlist (`CORS_ORIGIN`) plus loopback dev origins.
- **Session cookie behavior**: development uses `SameSite=Lax` + `Secure=false`; production uses `SameSite=None` + `Secure=true` for cross-site frontend/API deployments.
- **Internal ops**: API routes under **`/internal/scans`** require **`INTERNAL_OPS_TOKEN`**; browser clients do not send internal tokens and cannot call internal ops endpoints directly.

---

## 3. Current Wins / Achievements

Concrete capabilities already present in the codebase:

- **Clear separation of concerns**: API vs worker vs web vs shared storage package; worker and API **share** `processScanById` to avoid divergent pipelines.
- **Authentication and user model**: users table, password hashing, JWT issuance, profile/password endpoints; scans associated with **`user_id`**.
- **Hardened web auth transport**: JWT is now carried in HttpOnly cookies (`credentials: include`) instead of localStorage/bearer injection for browser sessions.
- **Signup safety**: duplicate email protection at validation and DB race level (`409 Email already exists`) plus unique-email migration for existing DBs.
- **Scan pipeline discipline**: explicit statuses, **`markProcessing` / `markCompleted` / `markFailed`**, idempotent skip if already completed, structured logging prefixes for direct mode.
- **Provider integration**: **mock** for fast feedback; **real** with **generic HTTP** and **Reality Defender** vendor branch; **normalization layer** (`normalizeProviderResult`) enforcing finite confidence, optional **`null`** `isAiGenerated`, non-empty summary, and **`details`** object shape.
- **Database**: indexed **`(user_id, created_at DESC)`** for history; incremental **`ALTER … IF NOT EXISTS`** style migrations for safer upgrades on existing DBs.
- **Private route cache hardening**: private/authenticated endpoints apply `Cache-Control: no-store, private, max-age=0` with `Pragma/Expires` no-cache headers.
- **Artifact and heatmap reliability**: expiring vendor URLs are persisted as internal assets and streamed via authenticated API endpoints.
- **History UX/API alignment**: normalized media-type filtering (`image`, `video`, `audio`, `document`, `other`) is enforced server-side and exposed to frontend filters.
- **Operational tooling**: health/ready endpoints, **`dev:check`** script, Docker Compose for Postgres/Redis/MinIO, integration tests for API/worker, storage check CLIs, internal retry/reset-stuck style operations (see OPERATIONS).
- **Frontend**: TanStack Router structure, React Query patterns for scans, **scan detail** with **media preview** component fetching **`/scan/:id/media`** with auth; dashboard analytics hooks to **`/scan/analytics/*`** endpoints.
- **Frontend robustness work**: login/auth shell and LiquidEther integration are now strict-TypeScript compatible; `three` typings are included in web dev dependencies.
- **Performance / cost-minded choices**: optional **direct** execution; **LiquidEther** and marketing pages tuned for scroll/LCP in web (separate from API); worker **concurrency** and **rate limiter** hooks via env.
- **Documentation**: README + OPERATIONS for operators; JSDoc contracts for provider input/output.

---

## 4. Product Strengths

### Technical

- **Single pipeline truth** for scan processing (worker module reused by API direct mode).
- **Explicit provider contract** (`ProviderResult`) and normalization before DB write—reduces “whatever JSON the vendor returned” risk.
- **Storage abstraction** with a **small, testable** package and S3 integration tests.
- **Observability hooks** in places (e.g. structured-ish logging for Reality Defender requests in adapter).

### Product / UX

- **Coherent authenticated journey**: scan → list → detail with preview.
- **Marketing surface** for acquisition narrative (landing, how-it-works) with responsive header patterns.
- **Internal ops** path for a small team to debug stuck/failed scans without exposing tools publicly.

### Architectural

- **Env-driven modes** (execution, provider, storage) keep one codebase deployable in **lean** or **scaled** configurations.
- **Postgres as system of record** for scan outcomes with **JSONB** for extensibility.

---

## 5. Future Upgrades / Roadmap

Roadmap items below are **suggestions aligned with the current architecture**, not committed dates.

### Short-term (weeks–few months)

- **Additional detection providers** behind the same `getProvider` / `normalizeProviderResult` pattern.
- **Provider normalization layer** enhancements (versioned payloads, richer error codes surfaced to UI).
- **Aggregate verdict engine** when multiple providers run (weighted voting, conflict rules)—schema/API may need extension beyond single `detection_provider` field.
- **Result explanation UI**: surface `result_payload.processors[…]` in human-readable, trust-preserving copy.
- **Mobile polish** on marketing and auth flows (ongoing).
- **Retry / error visibility** in product UI (not only internal ops).
- **Admin/internal tools**: expand filters, export, bulk actions (carefully gated).

### Mid-term (months)

- **Provider benchmarking** on held-out datasets (where you have labels)—engineering process more than product feature.
- **Confidence calibration** mapping provider scores to user-facing bands (requires data and policy).
- **Plans / billing**: `plan` column exists on users; productization of limits and API keys.
- **Reporting**: PDF/HTML exports, share links (with security review).
- **Async orchestration**: stronger queue semantics, dead-letter, priority, partial results.
- **Observability**: OpenTelemetry, metrics dashboards, SLOs on scan latency and failure rate.

### Long-term (quarters+)

- **Model-assisted aggregation** (only where legally/contractually allowed for customer media).
- **Audit trails** immutable event log for enterprise.
- **Team / org** models, roles, SSO.
- **Webhooks** and **integrations** (Slack, SIEM, MAM systems).
- **Compliance-grade reporting** and data residency options.

---

## 6. Potential Risk Areas / Things to Handle Carefully

Each row: **why it matters** → **current state** (brief) → **suggested mitigation**.

| Risk | Why it matters | Current state | Mitigation |
|------|----------------|---------------|------------|
| **Third-party detection APIs** | Core value depends on vendor uptime, pricing, and policy changes. | Real path calls external HTTP / Reality Defender; mock avoids that in dev. | Multi-vendor strategy, caching idempotency keys, circuit breakers, fallbacks where honest “unable to analyze” is better than silent wrong answers. |
| **Inconsistent provider responses** | Breaks normalization or misleads users. | `normalizeProviderResult` enforces minimum shape; adapters map vendor → contract. | Per-vendor integration tests, schema versioning in `result_payload`, UI guards for missing fields. |
| **False positives / negatives** | Legal and trust consequences for “authenticity” products. | Binary `isAiGenerated` can be **null** for inconclusive (documented in contract). | Conservative UX copy, confidence bands, human-in-loop workflows, disclaimers—not overclaiming “proof.” |
| **User trust & verdict wording** | Overconfident UI destroys credibility. | Summary + confidence stored; copy is app-defined. | Content review with legal/comms; show uncertainty explicitly. |
| **Cost scaling with volume** | Provider + storage + egress fees grow with scans. | Direct mode reduces Redis/worker cost; provider calls per scan remain. | Budgets/alerts, queue mode for burst absorption, rate limits (`SCAN_WORKER_RATE_*`), plan tiers. |
| **Long-running requests in direct mode** | Timeouts, connection limits, poor UX. | Processing runs in API request continuation after insert (as implemented). | Move heavy work to queue for production scale; set strict timeouts on provider HTTP; async “pending” UX already fits queue mode. |
| **Storage / security / privacy** | User media is sensitive. | Storage keys are not exposed to UI; authenticated media/heatmap/artifact routes; internal ops gated backend-side. | Encryption at rest (S3), retention policy, access logs, DPA with vendors, minimize PII in logs. |
| **Media size & performance** | Large files stress memory and timeouts. | Reality Defender path has size checks in adapter; generic limits depend on config. | Central size caps in API before accept; streaming/chunked upload where applicable; clear user errors. |
| **Operational blind spots** | Failures invisible until users complain. | Logging and internal ops exist. | Metrics, alerting on failure rate, stuck scan detection (partially present in ops). |
| **Vendor lock-in** | Hard to negotiate or migrate. | First-class Reality Defender path + generic real URL. | Maintain adapter boundary; keep normalized internal model. |
| **Limited explainability** | Users and regulators ask “why.” | `details` / `result_payload` carry processor payloads. | UI to expand evidence; optional LIME-style approaches only if scientifically valid—avoid theater. |
| **Schema evolution** | JSONB and migrations can drift across envs. | Incremental ALTERs in `migrate.js`. | Formal migration tool/version table over time; backward-compatible readers for `result_payload` versions. |

---

## 7. Recommended Engineering Priorities

Ordered by **impact × practicality** for a small team (re-evaluate quarterly):

1. **Harden production defaults**: queue mode + worker for anything beyond trivial traffic; document timeouts and max upload sizes.
2. **User-visible errors & retries**: map provider failures to actionable UI + safe retry (idempotency, duplicate job handling).
3. **Second provider (pilot)** behind same interface to prove multi-vendor architecture before building aggregation.
4. **Explainability pass**: scan detail UI for `result_payload` (collapsible technical detail + plain-language summary).
5. **Observability baseline**: structured logs + one dashboard (latency, failure rate, queue depth).
6. **Security review**: media access authorization on every path, cookie/session handling, CSRF planning, and CORS lockdown for production origins only.
7. **Automated integration tests** for URL scans and S3 paths if not already as broad as upload-local.
8. **Billing / limits** (if going to paid): wire `plan` to enforcement on scan creation and API keys.

---

## 8. Conclusion

**Observyx** already demonstrates a **credible vertical slice**: auth, scan CRUD, storage abstraction, pluggable detection with a **real vendor path (Reality Defender)**, worker/queue orchestration, **direct mode** for lean operation, a usable **web app** with preview and analytics endpoints, and **operator-facing** internal tools. That is a strong base for a authenticity-focused SaaS.

What is **not** implied by the repo alone: full **multi-tenant enterprise** features, **legal certification** of outputs, **deep media-type coverage** on the real provider path (verify against current Reality Defender integration scope in code/docs), or **complete** observability/compliance—those are **next-phase** investments.

**Why the next phase matters:** competitive trust products differentiate on **reliability, transparency, and governance**—not only on raw detection scores. Engineering priorities should bias toward **measurable quality**, **clear failure behavior**, and **honest UX** as volume and scrutiny increase.

---

## Executive summary (quick read)

- **Observyx** is a monorepo SaaS for **media authenticity scans**: **web** + **Express API** + **worker** + shared **scan-storage** (local/S3).
- **Flow**: authenticated scan create → persist media/metadata → **`processScanById`** (worker **or** API **direct** mode) → provider (**mock** / **real** / **Reality Defender**) → normalized result → **Postgres** + **JSONB** payload; **web** shows history, detail, and **media preview**.
- **Strengths**: shared pipeline, explicit provider contract, storage abstraction, ops docs/scripts, internal admin routes, env-driven **direct vs queue** cost/latency tradeoff.
- **Gaps / risks**: reliance on external detectors, trust/copy around verdicts, **direct mode** scaling limits, schema/observability maturity for enterprise.
- **Next focus**: production-grade execution path (queue + limits), better **errors/retries/UI**, second provider to validate multi-vendor design, then aggregation and reporting from a position of **measured** accuracy.
