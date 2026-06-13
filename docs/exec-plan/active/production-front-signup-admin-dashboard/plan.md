---
slug: production-front-signup-admin-dashboard
status: active
issue: 102
created: 2026-06-13
source: .gjc/plans/ralplan/2026-06-13-1528-f2cf/stage-07-final.md
revision-source: .gjc/plans/ralplan/2026-06-13-1528-f2cf/stage-04-revision.md
---

# RALPLAN Final Plan — Production Front: Facility Signup (Kakao OAuth) + Realtime NOC Admin Dashboard

Run: `2026-06-13-1528-f2cf` · Spec: `.gjc/specs/deep-interview-production-front-signup-admin-dashboard.md` (PASSED 8.8%) · Mode: DELIBERATE (auth/PII/multitenancy).

## Consensus Trace
Planner(stage-01) → Architect(stage-02 = BLOCK, 6 HIGH F1-F6) → Critic(stage-03 = ITERATE, F7-F15) → Planner revision(stage-04) → Architect(stage-05 = WATCH/COMMENT, F1-F6 RESOLVED) → Critic(stage-06 = **OKAY conditional**). **Authoritative implementation body = `stage-04-revision.md`** + the binding conditions below.

## Architecture (endorsed)
Backend-owned Kakao OAuth (Option B): backend `/auth/kakao/login|callback`, mints httpOnly session JWT cookie; single front-facing origin with Next rewrites for `/api/*` + `/sse` so the cookie is first-party for fetch and EventSource. Read-only SSE push (no WebSocket). Postgres/Prisma domain model with `orgId`-denormalized tenant scoping + **default-deny RLS**. Alert table = event log (alertSeq ordering). Per-camera **mandatory HMAC** ingest. Authenticated snapshot proxy (no public/edge-dereferenced URLs).

## ADRs to formalize (via `.claude` documentation-and-adrs → `docs/decisions/ADR-NNN`)
- **ADR-A — B2B facility multitenancy**: orgId scoping + Postgres RLS default-deny bound to per-request orgId GUC + dedicated NOSUPERUSER NOBYPASSRLS runtime role + composite FKs. Alt: app-layer opt-in filter (rejected: not structural). Consequence: isolation is a DB invariant; needs separate migrate/seed privileged role.
- **ADR-B — Kakao OAuth auth boundary**: backend-owned callback + single httpOnly session JWT, single browser-facing origin, no NextAuth. Alt: NextAuth front-owned (rejected: cross-origin cookie / split token lifecycle). Consequence: one identity owner; reusable for future #96 dispatch token.
- **ADR-C — Prisma domain model**: Organization/User/KakaoIdentity/Resident/Guardian/Camera/Alert/ResidentStatus; composite FKs; alertSeq bigserial; ResidentStatus read model. Consequence: single init migration; ADR-002 Postgres retained.
- **ADR-D — SSE realtime transport**: read-only cookie-auth push, alertSeq Last-Event-ID replay + REST status re-snapshot, single-instance MVP. Alt: WebSocket/socket.io (rejected: bidirectional unneeded; ML window dominates latency). Consequence: multi-instance fan-out (LISTEN/NOTIFY) deferred.

## Binding Pre-Execution Conditions (from Critic stage-06 — MUST be honored in execution)
1. **NR1 (HARD GATE)** — Runtime DB role = dedicated **NOSUPERUSER NOBYPASSRLS**, distinct from migrate/seed role; current `fall` superuser MUST NOT be the app runtime role; update `DATABASE_URL` guidance. **AC2/AC10 done-definition: un-scoped-query denial + cross-tenant 404 matrix MUST pass while connected AS the NOSUPERUSER app role** (a superuser run is NOT acceptable evidence).
2. **NR2** — All tenant access (Prisma ops AND raw `$queryRaw`) inside the org-bound interactive transaction or fail closed; denial test includes a raw-SQL path; document connection-pin + ~5s txn-timeout.
3. **F9** — Composite FK `(orgId, residentId) → Resident(orgId, id)` for **Guardian AND ResidentStatus** (revision covered only Camera/Alert) + composite unique on `Resident(orgId,id)`; FK-rejection tests both.
4. **F10** — Decide + verify SSE path (unbuffered Next 16 rewrite OR dedicated non-buffering same-origin route); AC6 sub-second + reconnect verified against the chosen path, not assumed.
5. **F3-emit** — Single-consumer in-process write queue for assign+commit+emit; client sorts/dedups by alertSeq; interleaved-insert reconnect test asserts no live-emit reorder.
6. **NR3** — Specify seed/migration path under RLS FORCE (privileged role OR per-org GUC).
7. **NR4** — Standardize on Prisma Client extension (`$allOperations`); remove deprecated `$use` middleware phrasing.

## Acceptance Criteria
AC1-AC12 per spec (mapped to phases in stage-04 §5). **Augment:** AC2/AC10 evidence valid ONLY when isolation/denial tests run AS the NOSUPERUSER app role (NR1); add NR2 raw-SQL denial path + F3-emit interleaved reconnect test + F9 FK-rejection tests.

## Implementation Phases (detail in stage-04 §4)
P1 Prisma models + **RLS + NOSUPERUSER role** + migration + seed (gates all) → P2 auth (backend callback + session + RLS-GUC tenant guard, front login/onboarding + rewrites) → P3 backend domain REST + SSE + HMAC ingest + snapshot proxy + ResidentStatus → P4 front pages (dashboard/history/admin CRUD + SSE client) → P5 demo sim injector (same ingest contract, env keys) → P6 tests + typecheck/lint.

## Execution Handoff (binding)
- **Clean worktree**: new issue per slice → `git wt <issue#>` off origin/main; NO direct work on the current main checkout (carries untracked `.gjc/`, `serving-predict-real-inference/`). Carry spec/plan artifact paths into the worktree.
- **PR on completion**: each slice `<type>/<issue#>-<slug>` → commit → push → issue-linked PR. PR is part of every issue's done-definition.
- **ADRs** via documentation-and-adrs before/at slice merge.
- **Kakao Developers console** setup is **human-auth gated** (Chrome + user login) at execution start.
- **Multi-provider** (codex/gemini) cross-review at ADR/PR checkpoints.
- Issues (stage-04 §8): Prisma models [closes #27], auth, backend API+SSE+ingest, front pages, demo injector, ADRs; #36 closed by SSE ADR, #37 CI hook (AC10), #38 env (P1/P0).

## Status
**pending approval** — but EXPLICIT user execution approval captured this session ("합의 끝나면 쭉 밀어서 개발해버려"). → Proceed to **ultragoal** autonomous execution, gated on the 7 binding conditions (NR1 non-negotiable hard gate).


---

## Authoritative Revision Body

# RALPLAN Revision Pass (iteration 2): Production Front Signup (Kakao OAuth) + Realtime NOC Admin Dashboard

Spec: .gjc/specs/deep-interview-production-front-signup-admin-dashboard.md (PASSED 8.8%). Mode: DELIBERATE (auth/PII/multitenancy). Endorsed core (Architect/Critic): backend-owned Kakao OAuth, single httpOnly session, read-only SSE, Postgres event log, denormalized orgId. This revision integrates Architect F1-F6 and Critic F7-F15.

## 1. RALPLAN-DR Summary (unchanged core, hardened invariants)
Principles: P1 fail-fast (ADR-014); P2 tenant isolation as a DB-level default-deny invariant (not opt-in helper); P3 Postgres everywhere (ADR-002); P4 transport minimalism (read-only SSE, WS rejected); P5 PII minimization (org-scoped, guardian phone masked, no consent flow this build); P6 life-safety: never drop a distinct alert.
Decision drivers: D1 auth boundary + single cookie origin; D2 structural tenant isolation enforced in the data layer; D3 demo-without-compromise via identical alert-ingest contract.
Auth option decision retained: Option B (backend owns OAuth callback + single httpOnly session JWT). NextAuth/front-owned session invalidated (split identity, awkward cross-origin SSE cookie). See F1 for the now-fixed single browser-facing origin.

## 2. Architect/Critic Fixes Integrated

### F2 (TOP PRIORITY) Tenant isolation = default-deny DB invariant
Decision: enforce orgId scoping in the data layer, not via opt-in query helpers. Primary mechanism: Postgres Row-Level Security (RLS). Every tenant table (Resident, Guardian, Camera, Alert, ResidentStatus, KakaoIdentity) gets RLS ENABLE + FORCE with a USING/WITH CHECK policy of org_id = current_setting(app.current_org_id). A NestJS request-scoped Prisma middleware sets the per-request GUC app.current_org_id from req.user.orgId inside a transaction (SET LOCAL) before any query; absent/empty GUC -> policy denies all rows (default-deny). Backstop layer: a Prisma Client extension wrapping all operations (the allOperations hook) that hard-fails any query against a tenant model when no org context is bound, so a forgotten transaction is a typed boot/runtime error, not a silent full-table scan. The two layers are belt-and-suspenders: RLS is the authority, the extension catches misuse before it hits the DB.
Composite FK (F9): enforce coherence at the schema level. Camera has composite FK (orgId, residentId) -> Resident(orgId, id); Alert has composite FK (orgId, residentId) -> Resident(orgId, id) and (orgId, cameraId) -> Camera(orgId, id). Requires composite unique keys Resident(orgId, id), Camera(orgId, id). This makes a row whose child orgId mismatches its parent unrepresentable.
Tests: (a) un-scoped-query test - run each tenant model query with no GUC bound and assert zero rows / typed error; (b) cross-tenant 404 matrix - as org A, attempt read of every org B entity by id and assert 404 for all.

### F1 Cookie-origin model (single browser-facing origin, no ambiguity)
Decision: ONE browser-facing origin = the front Next.js origin. Kakao redirect_uri is registered on the FRONT origin and /auth/* is added to Next rewrites (joining /api/* and /sse) so the entire browser surface is same-origin and the session cookie is first-party for fetch and EventSource. Backend is not directly browser-facing. Cookie attributes (single definition): name app_session; httpOnly; Secure (prod); SameSite=Lax; Domain = the front origin host; Path=/. The OAuth state cookie: httpOnly, SameSite=Lax, Path=/auth, short TTL. We do NOT also expose backend origin to the browser - the dual-origin path is closed.

### F4+F5+F7 Ingest: mandatory HMAC + freshness + non-SSRF snapshot path
Decision: ingest auth = HMAC, not a bare static key. Sender computes HMAC-SHA256 over canonical(body) + detected_at using a per-camera secret; sends X-Ingest-KeyId (selector only, identifies which camera secret) + X-Ingest-Signature + X-Ingest-Timestamp. Backend looks up camera by key-id, recomputes HMAC, constant-time compares. Freshness/replay window: reject if timestamp skew exceeds a bounded window (e.g. 5 min) AND if (camera, detected_at, type) already seen (replay). The static key-id is purely a selector; it grants nothing without a valid signature.
Idempotency: server-derived canonical key = hash(cameraId + detected_at + type). Sender-supplied keys are ignored for dedup correctness. Unique constraint Alert(orgId, idempotencyKey).
Snapshot path (non-SSRF): the backend NEVER dereferences an edge-supplied URL. Two allowed inbound paths only: (a) ingest-key-authenticated signed PUT - backend issues a short-lived org-scoped signed upload target to the verified camera, which PUTs the image; backend stores the resulting internal storage key; or (b) authed multipart upload endpoint where the camera posts image bytes alongside the alert under its HMAC. snapshot_url in the payload is treated as an opaque client hint and is NOT fetched. Stored Alert.snapshotKey is an internal org-scoped storage key.

### F3 + AC8 Serialized alert insert -> alertSeq == commit/emit order
Decision: serialize alert inserts on a single instance using a Postgres advisory lock (pg_advisory_xact_lock keyed per-org) OR an in-process write queue, so alertSeq assignment, commit, and SSE emit happen in the same order. alertSeq is a bigserial; emit only after commit. This removes the gap where seq is assigned but a later-seq row commits first.
AC8 redefined: on reconnect the client sends Last-Event-ID (= last alertSeq seen). Backend replays alerts WHERE orgId bound AND alertSeq > lastEventId ORDER BY alertSeq, THEN the client re-snapshots ResidentStatus via REST (F8: status is a current-state read model, not replayed through the event log). Live stream resumes after backlog flush.
Test: interleaved-concurrent-insert reconnect test - fire concurrent ingest from multiple cameras while a client drops and reconnects mid-flight; assert every committed alertSeq is delivered exactly once and in order (not just a clean-drop test).

### F6 + AC4 Session lifecycle: TTL / rotation / revocation + SSE re-auth
Decision: session JWT short TTL (e.g. 30 min access claim) carried in the httpOnly cookie, plus a server-side session record (sessionId in JWT) so revocation is real. Refresh: sliding rotation - on activity within a refresh window, mint a new JWT + rotate sessionId, invalidate the prior. /auth/logout deletes the server-side session record. SSE max-lifetime: each SSE connection has a bounded lifetime (e.g. re-auth every TTL); the SSE handler re-validates the session record on each keep-alive tick and on reconnect, so a revoked/logged-out session causes the stream to be closed server-side (logout actually severs the stream, not just future fetches).
AC4 assertion: test that (i) secrets only from env, missing secret -> fail-fast boot; (ii) cookie httpOnly+Secure+SameSite=Lax; (iii) after /auth/logout, both a subsequent API call AND the live SSE stream are rejected/closed within one keep-alive tick.

### Tension3 (life-safety) Never drop distinct alerts
Decision: the promoted pilot cooldown applies ONLY to OUTBOUND dispatch throttling (the deferred #96 send layer), NOT to alert ingestion/storage. Ingest stores every distinct alert. Dedup at ingest is strictly exact-duplicate only (same server-derived idempotency key = same camera+detected_at+type retransmit). Repeated/sustained alerts for one resident are visually collapsed in the dashboard feed (grouped with a count + latest timestamp) but every row is persisted. No throttle, cooldown, or rate-limit ever discards a distinct stored alert.

### F11-F15 Standardizations
- F11 null-org hard reject: any /data route (residents/guardians/cameras/alerts/sse/status) with a session whose orgId is null (pre-onboarding) is hard-rejected; only /auth/me and /orgs (create) are reachable. Guard returns 403 for null-org-on-data (own-account-not-yet-provisioned), distinct from cross-tenant.
- F12 404 standardization: cross-tenant reads (resource exists but belongs to another org) return 404 (do not reveal existence). 403 is reserved for unauthenticated-shaped / own-tenant-forbidden (e.g. null-org accessing data) cases only.
- F13 SSE id field = alertSeq (the bigserial), never the cuid PK. Last-Event-ID parsing expects an integer alertSeq.
- F14 demo ingest keys come from env (same HMAC mechanism as prod), and the demo/sim path uses the SAME snapshot upload path as prod (signed PUT / authed multipart) - no special-case bypass.
- F15 bootstrap explicit: main.ts wires cookie-parser, a global ValidationPipe (whitelist + forbidNonWhitelisted + transform), and CORS configured for the single front origin with credentials. Missing required env -> fail-fast at boot.

## 3. Prisma Data Model (revised)
Tenant tables carry orgId and are under RLS (ENABLE + FORCE) with policy org_id = current_setting(app.current_org_id).
- Organization: id (cuid pk), name, businessRegistrationNumber (nullable), createdAt. No RLS (root tenant table; access gated by membership in app code).
- User: id, orgId (nullable until onboarding) FK, kakaoId (UNIQUE), email (nullable), nickname, role enum {OWNER, ADMIN}, sessionVersion (int, for global revoke), createdAt.
- KakaoIdentity: id, userId (UNIQUE) FK, kakaoId, tokenExpiresAt (nullable; access/refresh tokens NOT stored this build), createdAt.
- Resident: id, orgId FK, name, room (nullable), createdAt. Composite unique (orgId, id). RLS.
- Guardian: id, residentId FK, orgId (denormalized), name, phone (masked in UI), relation (nullable), createdAt. RLS.
- Camera: id, orgId FK, residentId (nullable), label, ingestKeyId (selector), ingestSecretHash, lastSeenAt (nullable), online (bool default false), createdAt. Composite unique (orgId, id); composite FK (orgId, residentId) -> Resident(orgId, id); unique (orgId, label). RLS.
- Alert: id (cuid pk), alertSeq (bigserial; ordering for Last-Event-ID), orgId FK (== facility_id), residentId FK, cameraId (nullable), type, probability (float), snapshotKey (nullable internal key), detectedAt, status enum {NEW, ACKED, RESOLVED} default NEW, idempotencyKey (server-derived), createdAt. Index (orgId, alertSeq); unique (orgId, idempotencyKey); composite FK (orgId, residentId), (orgId, cameraId). RLS.
- ResidentStatus: id, residentId (UNIQUE) FK, orgId, state enum {NORMAL, WARNING, FALL} default NORMAL, lastSeenAt (nullable), cameraOnline (bool default false), source (nullable cameraId), updatedAt. RLS.
- ServerSession: id (sessionId, cuid), userId FK, orgId (nullable snapshot), expiresAt, revokedAt (nullable), createdAt. Used for revocation + SSE re-auth.
Enums: Role, AlertStatus, ResidentState.
First migration: edit schema, then prisma migrate dev --name init_domain_models. RLS policies + composite FKs + advisory-lock helpers are added in the same migration via a raw-SQL migration step (Prisma migration SQL append), since Prisma does not model RLS natively. Then prisma db seed (env-driven demo org + cameras with HMAC key-ids).

## 4. Implementation Phases + File/Path Map
Phase 0 - Env + ADRs (gate). Update root .env.example, backend/.env.example: DATABASE_URL, KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET, KAKAO_REDIRECT_URI (front origin), SESSION_JWT_SECRET, INGEST_HMAC settings, DEMO_INGEST_KEYID/SECRET, SNAPSHOT_STORAGE config. Secrets committed = 0. Produce 4 ADRs (section 6). Kakao console setup human-auth gated (Chrome + user login).
Phase 1 - Prisma models + RLS migration + seed. backend/prisma/schema.prisma, raw-SQL migration (RLS policies, composite FKs), backend/prisma/seed.ts, backend/src/prisma/tenant.middleware.ts (SET LOCAL GUC) + prisma client extension (allOperations org-context guard). Verify: migrate, generate, seed, un-scoped-query denial test.
Phase 2 - Auth (backend + front, single origin). Backend backend/src/auth/: auth.controller.ts (/auth/kakao/login, /auth/kakao/callback, /auth/logout, /auth/me), auth.service.ts, kakao.client.ts, session.service.ts (mint/rotate/revoke ServerSession), session.guard.ts (verify JWT + ServerSession + inject req.user), org-context.interceptor.ts (bind GUC), null-org.guard.ts. Front: front/next.config.ts rewrites for /auth/*, /api/*, /sse -> backend; front/src/app/login/page.tsx, front/src/app/onboarding/page.tsx, front/src/middleware.ts (auth redirect), front/src/lib/session.ts. Verify: unauth 401, login round-trip (AC1), null-org data reject (F11), logout severs SSE (F6).
Phase 3 - Backend domain API + SSE + ingest. backend/src/orgs/, residents/, guardians/, cameras/, alerts/ (alerts.controller: list/detail/ack, snapshot proxy GET /snapshots/:alertId org-scoped), status/ (ResidentStatus + decay), dashboard/sse.controller.ts (GET /sse, alertSeq replay, re-auth ticks), ingest/ (ingest.controller.ts POST /ingest/alerts, hmac.guard.ts, snapshot-upload signed PUT / multipart), alerts/alert-writer.service.ts (advisory-lock serialized insert + emit), common/ (typed exceptions, 404-standardizer, ValidationPipe). Verify: tenant matrix, ingest HMAC+freshness+idempotency, serialized alertSeq, interleaved reconnect test.
Phase 4 - Front pages. front/src/app/(dashboard)/dashboard/page.tsx (status badges + collapsed alert feed + snapshot thumb), (dashboard)/alerts + alerts/[id] (history pagination/filter), admin/residents, admin/cameras, admin/guardians (CRUD), front/src/lib/api.ts, front/src/lib/sse.ts (EventSource reconnect with Last-Event-ID = alertSeq, REST status re-snapshot on reconnect), components/ (StatusBadge, AlertFeed with visual collapse, SnapshotThumb). Verify: scoped render (AC5), sub-second SSE (AC6), reconnect re-snapshot (AC8).
Phase 5 - Demo sim injection. scripts/sim-fall.ts (or ml/demo hook) posting to /ingest/alerts with env demo key-id + HMAC + same snapshot upload path as prod. Verify: AC12 end-to-end.
Phase 6 - Tests + typecheck/lint. backend/test/ e2e, colocated unit. Verify: pnpm typecheck, pnpm lint, backend test green (AC10).

## 5. Acceptance Criteria Mapping
- AC1 (P2): new kakaoId -> callback -> onboarding -> Organization + User OWNER; login works.
- AC2 (P1/P3): RLS denies cross-org; org A sees only org A rows.
- AC3 (P2/P3): no session -> 401; null-org on data -> 403; cross-tenant -> 404 (F12).
- AC4 (P0/P2): secrets env-only + fail-fast; cookie httpOnly+Secure+SameSite=Lax; post-logout API AND SSE both rejected within one tick.
- AC5 (P4): owner sees own residents status + feed.
- AC6 (P4/P5): inject -> SSE -> feed under ~200ms transport.
- AC7 (P3/P4): /alerts paginated+filtered org-scoped; cross-org detail 404.
- AC8 (P3): interleaved-concurrent-insert reconnect by alertSeq -> no miss/dup/reorder + REST status re-snapshot.
- AC9 (P3): ingest rejects payload missing any contract field with typed exception; HMAC/freshness enforced.
- AC10 (P1/P6): migrate+seed, typecheck/lint/test pass.
- AC11 (P0): 4 ADRs merged.
- AC12 (P5): full signup -> dashboard -> sim injection (same contract + snapshot path) -> sub-second feed.

## 6. ADR Candidates (documentation-and-adrs)
- ADR: B2B facility multitenancy via Postgres RLS + composite FK + GUC binding (default-deny).
- ADR: Kakao OAuth auth boundary (backend-owned callback, single front origin, httpOnly session JWT + ServerSession revocation).
- ADR: Prisma domain model + alertSeq serialized event log.
- ADR: SSE realtime transport (read-only, cookie auth, alertSeq replay + REST status re-snapshot, single-instance MVP, multi-instance deferred).

## 7. Deliberate Mode - Pre-mortem + Extended Test Plan
Pre-mortem 1 (tenant leak): failure = a query runs without org binding. Mitigation (DB-invariant, not self-refuting): RLS default-deny means an unbound query returns zero rows; the allOperations extension turns unbound access into a typed error before the DB. Test: un-scoped-query denial + cross-tenant 404 matrix.
Pre-mortem 2 (SSE reconnect loses/reorders events under concurrency): failure = seq assigned but later seq commits first, or revoked session keeps streaming. Mitigation: advisory-lock serialized insert+emit, emit-after-commit, alertSeq DB replay, SSE re-auth tick. Test: interleaved-concurrent-insert reconnect + logout-severs-stream.
Pre-mortem 3 (ingest spoof / SSRF / dropped life-safety alert): failure = forged ingest, backend fetches malicious edge URL, or cooldown silently drops a real fall. Mitigation: mandatory HMAC + freshness/replay window; backend never dereferences edge URLs (signed PUT / authed multipart only); cooldown confined to outbound dispatch; ingest stores every distinct alert, exact-dup-only dedup. Test: HMAC tamper/replay rejection, SSRF attempt (edge URL never fetched), distinct-alert-never-dropped.
Extended tests: Unit - HMAC verify/freshness, idempotency derivation, session mint/rotate/revoke, status derivation, RLS GUC binding. Integration - tenant matrix, null-org reject, 404 standardization, serialized alertSeq, SSE replay+re-auth, ingest coherence, composite-FK rejection. E2E - signup->onboarding->dashboard, sim injection (AC12), history pagination, ack, logout-severs-stream. Observability - structured audit on ingest (camera, decision, dedup-hit, HMAC-fail), SSE connect/replay/reauth metrics, boot fail-fast on missing secrets, alert lifecycle timestamps.

## 8. Issue / Worktree / Execution Handoff
Existing: #27 (this implements), #36 (resolved SSE -> close with ADR ref), #37 (CI/AC10), #38 (Phase 0 env/secrets), #30 (relates to Phase 3 SSE push).
New issue titles:
- feat(backend): Prisma domain models + RLS/composite-FK migration + seed [closes #27]
- feat(auth): backend-owned Kakao OAuth, single front origin, httpOnly session + ServerSession revocation + SSE re-auth
- feat(backend): org-scoped REST + serialized SSE event log + HMAC alert ingest + non-SSRF snapshot upload
- feat(front): signup/onboarding/dashboard/history/admin-CRUD on Next 16 + SSE client (alertSeq reconnect + status re-snapshot)
- chore(demo): env-keyed HMAC sim fall-event injector on the prod ingest + snapshot path (AC12)
- docs(adr): four cross-cutting ADRs
Execution handoff constraints (MANDATORY):
- Implement ONLY in a clean working tree. Do NOT implement in the current main checkout (untracked .gjc/ and serving-predict-real-inference/ are floating). For each new issue: publish the issue, then git wt <issue#> to create a fresh clean worktree cut from origin/main (ADR-008). No direct work on main.
- Done-definition for every issue slice INCLUDES a PR: branch <type>/<issue#>-<slug> -> commit -> push -> open a PR linked to the issue. Not done until PR is up.
- spec/plan artifacts (.gjc/specs, .gjc/plans/ralplan/2026-06-13-1528-f2cf) must be path-referenced or copied into the worktree since they are untracked on main.
- Sequencing: Phase 1 (Prisma+RLS) gates all; then Phase 2 auth; Phases 3/4 can parallelize via team after 1+2 land. Hand bounded slices to executor per issue; architect reviews auth-boundary + RLS tenant guard; critic confirms ingest HMAC/SSRF + SSE serialized replay are concrete before execution. Kakao console setup human-auth gated at execution start.
