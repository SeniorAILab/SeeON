---
slug: api-event-contract-rest-convention-single-owner
status: pending approval → approved (user option A, 2026-06-18)
issue: 216
mode: deliberate / consensus
ralplan_run: .gjc/plans/ralplan/2026-06-18-api-contract
---

# Execution Plan: API/Event Contract Single Owner + REST/Layering Convention + Cross-Cutting Refactor

## Consensus Record
- Planner stage-01 → Architect stage-01 = BLOCK / REQUEST CHANGES (6 concerns, 2 HIGH) → Critic stage-01 = ITERATE (7 required revisions).
- Planner resumed → revision stage-02 (all 8 consolidated items addressed).
- Architect stage-02 = WATCH / APPROVE; Critic stage-02 = OKAY / APPROVE → CONSENSUS.
- User approved execution (option A: execute now, ultragoal-tracked, ~6 parallel subagents, DB reset OK).

## Summary
Establish docs/ as the single owner for front-backend-ML API and event contracts, then refactor backend, frontend, ML serving, tests, and Prisma naming to match. Locked D1-D5: docs first, no contracts/ root, backend owns alert policy/persistence/dedup/delivery, ML predicts, /ingest/alerts is the only canonical alert ingress, route normalization is full scope, Prisma model fields camelCase while DB columns become snake_case via @map/@@map.

## Phase 0 — gates (RESOLVED)
- G-R1 = PASS → R1-A. Geometry: window=[T][51] (17 COCO-17 kpts × x,y,conf, normalized via normalize_person_keypoints), reshape [T,17,3] → extract_window_features → 45-dim → FallDetector.predict_proba. EXPECTED_WINDOW=30, EXPECTED_FEATURE_DIM=45. Response {fall_probability, operating_threshold(metadata/default), is_fall=prob>=threshold}.
- G-D2-owner = D2-O1. Retain prediction port + ML adapter in AlertsModule as documented, tested, currently-unused future seam (not a second alert ingress).
- Inventory: /auth/me + /sse are NOT consumer-free — used as session/rotation probes in backend/test/auth.spec.ts + app-boot.spec.ts; removal requires migrating those tests to /auth/session (or a retained probe). /api/snapshots consumed by front SnapshotThumb. /orgs consumed by front onboarding + next.config rewrite.

## Phase 1 — docs (parallel, disjoint files)
- docs/rules/: backend-layering, rest-api-convention, dto-convention, file-structure-convention, realtime-sse-convention
- docs/api/: README, route-inventory, edge-ingest-api, dashboard-api, ml-serving-api (window contract proposed-pending-Phase-0 → now R1-A confirmed), realtime-events, kakao-delivery-api (Kakao availability labeled separately)
- docs/domain/: data-dictionary (Prisma field ↔ DB column glossary + naming rule), alert-pipeline (Alert read-model + AlertEvent/DeliveryAttempt outbox = one domain, two write concerns; D2 prediction seam = future, not a second ingress)

## Phase 2 — ADRs (serial)
1. backend: REST API + layering convention.
2. backend: canonical single-ingress cleanup — ADR-043 successor removing /api.alerts/events; /ingest/alerts is the only live ingress.
3. common: ML/backend window-predict contract — ADR-023 successor/extension; R1-A confirmed; D2-O1 retained seam owner.
4. backend: Prisma snake_case column naming.
Use next available ADR IDs; keep docs/decisions/README.md index + supersession links consistent.

## Phase 3 — code refactor (file-bounded slices)
### S1 ingest → IngestAlertService + DTO
Move IngestController parsing/required-fields/probability/detected_at/freshness/tenant-coherence/idempotency into IngestAlertService + ingest-alert.dto; controller thin; preserve writeAlert, P2002 duplicate repair, ensureOutboxForIngest on created + duplicate paths. No route rename, no legacy removal, no Prisma changes. Update ingest tests.

### S2 remove /api.alerts/events ingress + prediction seam cleanup
Remove AlertEventsController + module registration; retire AlertEventsService.ingest/predictAndIngest legacy route-consumer paths; keep ensureOutboxForIngest + repository/channel dispatch; keep ALERT_PREDICTION_PORT + MlServingPredictionAdapter wired (D2-O1) with a test asserting no /api.alerts/events route. Prune alert-events.controller.spec + legacy predictionDouble/predictAndIngest tests; retain ml-serving-prediction.adapter.spec as the seam contract test.

### S3S4 atomic backend+front route normalization (ONE slice)
POST /orgs → /api/orgs; remove /auth/me; remove dead /sse probe; GET/PUT /api/snapshots/:alertId → /api/alerts/:alertId/snapshot; front onboarding fetch → /api/orgs; SnapshotThumb → /api/alerts/${alertId}/snapshot; remove /orgs rewrite from next.config.ts. Migrate auth.spec.ts + app-boot.spec.ts probes (/auth/me, /sse) → /auth/session or retained probe. No mergeable state where front calls a path backend no longer serves. Preserve Kakao login → session → onboarding(/api/orgs) → dashboard.

### S5 ML /predict window contract (R1-A)
ml/serving: PredictRequest accepts {window:number[][]} ([T][51]); response {fall_probability, operating_threshold, is_fall}; add real predict_window using window_to_features/extract_window_features + FallDetector (reshape [T,51]→[T,17,3]); operating_threshold from metadata or documented default; is_fall = prob >= threshold; preserve source_id/upload_id demo/eval mode (discriminated branch / separate response). Align backend MlServingPredictionAdapter contract. Update ml serving tests. Never fake window success.

### S6 Prisma snake_case + migration (LATE merge gate, after S1/S2/S3S4)
Add @map snake_case to all model fields + verify @@map tables; preserve Prisma camelCase API; DB reset via `prisma migrate reset --force` (dev, user-approved) then generate + migrate + seed; confirm RLS GUC + composite @@unique/FK behavior. No cardinality/RLS-semantics change.

## Phase 4 — lead verification + demo E2E
pnpm typecheck · pnpm lint · pnpm --filter backend test · uv run --directory ml pytest · pnpm --filter front test · pnpm db:up · pnpm prisma:generate · pnpm prisma:migrate (reset) · pnpm prisma:seed.
Manual demo E2E with SEPARATE labels (PASS/FAIL/UNAVAILABLE, never fake):
1. Front Kakao login → /auth/session → onboarding via /api/orgs → dashboard.
2. Real HMAC POST /ingest/alerts → Alert + ResidentStatus + AlertEvent/DeliveryAttempt.
3. Dashboard SSE + /api/alerts history + normalized snapshot + ack.
4. Per-user Kakao send-to-me to the logged-in user's OWN KakaoTalk (real creds only; UNAVAILABLE otherwise; never faked).
5. Removed routes absent: /api.alerts/events, /orgs, /api/snapshots/:alertId, /sse, /auth/me.

## Risk register
- R1 (ML window geometry): RESOLVED → R1-A confirmed; geometry pinned.
- R2 (migration collision): mitigated by dev DB reset (user-approved `prisma migrate reset --force`); S6 late gate.
- R3 (route rename split breakage): S3S4 is one atomic slice incl. next.config + test migration.
- R4 (orphaned prediction seam): D2-O1 retained owner + seam test.
- R5 (Kakao mislabel): Phase 4 separates ML / dashboard-history / Kakao availability labels.

## PR decomposition (per docs/rules/pr-decomposition-and-review.md)
1. PR-Docs (Phase 1). 2. PR-ADRs (Phase 2). 3. PR-S1-S2 (ingest extraction + legacy ingress removal). 4. PR-S3S4 (atomic route normalization). 5. PR-S5 (ML window contract). 6. PR-S6 (Prisma migration, late). 7. Optional PR-Integration (test wiring only).

## ADR (distilled)
- Decision: docs/ is the single owner for API/event contracts; /ingest/alerts is the only live alert ingress; after /api.alerts/events removal the backend-ML prediction seam is owned by AlertsModule/prediction.port.ts/ml-serving-prediction.adapter.ts as a currently-unused future seam; ML /predict(window) is R1-A (45-dim feature pipeline); backend owns policy/persistence/dedup/outbox/delivery/dashboard read-model; Prisma fields camelCase + DB columns snake_case.
- Drivers: eliminate duplicate ingress + route/DB-naming drift; make ML/backend boundary executable without orphaning seams; preserve real demo correctness incl. Kakao self-notification.
- Alternatives considered: keep /api.alerts/events alias (rejected — preserves drift); delete prediction seam (rejected unless D2-O2); freeze window contract before geometry (rejected — gated by G-R1, now resolved); let ML emit alerts (rejected by ADR-023); keep mixed Prisma naming (rejected — future exception burden).
- Why chosen: aligns code with ADR-022/023/043 intent, removes pilot surfaces, durable docs ownership before code changes, no silent orphaned contracts.
- Consequences: cross-cutting refactor; callers of removed routes move atomically; future API changes update docs/api + relevant ADR/rules first; migration lands late.
- Follow-ups: API inventory CI after normalization; archive plan + distill expensive-to-reverse changes after merge; consider automated contract tests once docs SSOT stabilizes.
