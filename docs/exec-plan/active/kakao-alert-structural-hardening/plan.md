---
slug: kakao-alert-structural-hardening
title: "Kakao Alert Structural Hardening"
type: plan
date: 2026-06-13
owner: gobeumsu
issue: 29
status: active
source: .gjc/plans/ralplan/2026-06-13-1528-f2cf/stage-01-final.md
---

# RALPLAN Final Pending Plan: Kakao Alert Structural Hardening

## Metadata
- Status: pending approval
- Run ID: 2026-06-13-1528-f2cf
- Source spec: `.gjc/specs/deep-interview-kakao-alert-structural-hardening.md`
- Planner artifact: `.gjc/plans/ralplan/2026-06-13-1528-f2cf/stage-01-planner.md`
- Architect artifact: `.gjc/plans/ralplan/2026-06-13-1528-f2cf/stage-01-architect.md`
- Critic artifact: `.gjc/plans/ralplan/2026-06-13-1528-f2cf/stage-01-critic.md`
- Architect verdict: CLEAR / APPROVE
- Critic verdict: OKAY / APPROVE
- Planning mode: deliberate
- Execution boundary: no implementation until separate explicit execution approval

## Consensus Decision

Proceed with a backend-owned, production-grade alert pipeline design:

1. **Production flow:** Nest backend calls FastAPI `/predict`, consumes `{ fall_probability, operating_threshold, is_fall }`, and owns product alert policy, deduplication, rate-limit, idempotency, persistence, and delivery orchestration.
2. **Pilot/edge ingress:** `POST /api.alerts/events` remains as a trusted ingress for demo/live pilot/edge adapters only. It requires `x-alert-api-key` and payload-level `external_event_id` for idempotency.
3. **Nest structure:** Implement alerts as a domain-bounded Nest module, not global folder-theater layering: controller, use-case/service, repository, ports, and adapters live inside the alerts domain boundary while reusing the existing global `PrismaModule`.
4. **Durable state:** Add Prisma/Postgres `AlertEvent` and `DeliveryAttempt` models. Persist event and delivery state before external side effects. Duplicate `(source_id, external_event_id)` must not create another delivery attempt or send another Kakao message.
5. **Channel boundary:** Keep Kakao Developers send-to-me as a pilot adapter behind `ChannelPort`; design the port and `DeliveryResult` shape so future AlimTalk/SMS provider adapters can map into the same transient/terminal semantics.
6. **Verification stance:** Reuse existing real Kakao receipt evidence. Automated gates use mocks/contracts/secret scans; new real sends are manual-only and explicitly approved.

## RALPLAN-DR Summary

### Principles
1. Backend owns product decisions and external side effects.
2. ML/FastAPI provides model signal only; it does not own alert semantics.
3. Durable Postgres state precedes channel dispatch.
4. Pilot proof is preserved but isolated from production contracts.
5. Provider portability and secret hygiene are architectural requirements, not cleanup tasks.

### Decision Drivers
1. **Reliability and auditability:** fall alerts must handle duplicate requests, retries, terminal failures, and operator visibility.
2. **Ownership clarity:** `/predict` and `/api.alerts/events` have different trust models and must not collapse into one API.
3. **Kakao production constraints:** Kakao Developers send-to-me is PoC-friendly but production notifications should be AlimTalk/provider-ready.

### Options Considered

#### Option A — Backend-orchestrated production path + trusted pilot ingress + Postgres outbox + ChannelPort (Chosen)
- Pros: aligns with `docs/architecture.md`; keeps product policy in backend; supports idempotency, retries, auditing, and provider portability.
- Cons: more schema and module work than direct webhook send.
- Decision: chosen because this work is structural hardening, not another demo-only path.

#### Option B — ML/FastAPI pushes alert events directly; backend relays Kakao
- Pros: simpler edge/demo flow.
- Cons: product policy and external side-effect ownership drift into ML; audit/outbox responsibility splits.
- Rejected for production default. Retained only as trusted pilot/edge ingress.

#### Option C — Direct backend Kakao send after policy decision, no durable outbox
- Pros: fastest to implement.
- Cons: crash windows, retry ambiguity, duplicate-send risk, weak audit.
- Rejected because acceptance requires durable alert/delivery state.

#### Option D — Implement AlimTalk provider immediately
- Pros: closest to production notification channel.
- Cons: requires business channel, templates, dealer contract, night-delivery policy confirmation, and external lead time.
- Rejected for this slice. Adapter boundary is in scope; provider onboarding is follow-up.

## ADR Plan

Use `.claude/skills/documentation-and-adrs/SKILL.md` during execution. The implementation plan must create or update ADRs under `docs/decisions/` for cross-cutting decisions. Do not write ADRs before execution approval.

Current decision index ends at ADR-021. The active dependency `docs/exec-plan/active/serving-predict-real-inference/` reserves:
- `ADR-022-predict-contract.md`
- `ADR-023-inference-layer.md`

Therefore, Kakao alert ADRs should start after those, likely:

1. **ADR-024 — Backend-orchestrated alert API architecture**
   - Decision: production backend consumes `/predict`; trusted pilot ingress remains separate.
   - Does not reopen: ADR-003 ML/backend responsibility split or ADR-022 `/predict` schema.

2. **ADR-025 — Nest domain-bounded layering for alerts**
   - Decision: alerts module owns controller, use-case/service, repository, ports, and adapters inside the domain boundary.
   - Rejected: global controller/service/repository folders, one giant alert service, or premature microservice split.

3. **ADR-026 — Postgres/Prisma alert event and delivery outbox model**
   - Decision: `AlertEvent` + `DeliveryAttempt`, unique `(source_id, external_event_id)`, retry metadata, provider refs, terminal reason/operator-action fields.
   - Must define before channel adapter work: enum values, legal transitions, transaction boundary, duplicate response behavior, and dispatch timing for this slice.

4. **ADR-027 — ChannelPort with send-to-me pilot and AlimTalk-ready boundary**
   - Decision: send-to-me is pilot-only; production provider adapters map into provider-neutral `ChannelPort`/`DeliveryResult`.
   - Rejected: hard-code Kakao Developers API into alert use case, treat send-to-me as production channel, or implement AlimTalk before provider readiness.

Worktree enforcement stays under ADR-008/ADR-016. Secret hygiene belongs in API/channel consequences and verification unless execution introduces a new mechanical secret gate; only then consider a separate ADR/rule update.

## Implementation Plan After Separate Approval

### Gate 0 — Approval and worktree
- Stop at this final plan until the user explicitly approves execution.
- Open a dedicated issue worktree with `git wt <issue#>` only after approval.
- Do not implement from `main`; do not hand-roll `git worktree add`.

### Step 1 — ADR and contract freeze
- Confirm ADR numbering after active `/predict` ADR-022/023 status.
- Draft the four Kakao ADRs above using the documentation-and-ADRs template.
- Freeze backend consumption of `/predict` to `{ fall_probability, operating_threshold, is_fall }`.
- If active `/predict` implementation has not landed, use mocks/contracts against the active spec and do not expand `/predict` into event-level alert semantics.

### Step 2 — Outbox state machine checkpoint
Before any channel adapter implementation, define in ADR/schema draft:
- `AlertEvent` lifecycle.
- `DeliveryAttempt` enum values.
- Legal transitions.
- Transaction boundary for event + first delivery attempt creation.
- Duplicate `(source_id, external_event_id)` response behavior.
- Dispatch timing for this slice: synchronous-after-commit vs worker-ready pending state.
- Transient retry scheduling and terminal/operator-action state.

### Step 3 — Prisma/Postgres models
- Add `AlertEvent` and `DeliveryAttempt` to `backend/prisma/schema.prisma`.
- Add unique constraint for `(source_id, external_event_id)`.
- Include audit fields for decision, status, channel, retry count, next attempt time, provider reference, terminal reason, operator action visibility, and timestamps.
- Reuse ADR-002 PostgreSQL/Prisma stance; no alternate DB provider.

### Step 4 — Nest alerts domain module
Likely targets, adjusted against the actual approved worktree state:
- `backend/src/app.module.ts` — register alerts module.
- `backend/src/alerts/alerts.module.ts` — domain boundary.
- `backend/src/alerts/controllers/*` — thin REST controllers.
- `backend/src/alerts/services/*` or use-case providers — policy, ingress, orchestration.
- `backend/src/alerts/repositories/*` — Prisma-backed persistence boundary.
- `backend/src/alerts/ports/*` — `ChannelPort`, ML prediction client port if introduced.
- `backend/src/alerts/adapters/*` — Kakao send-to-me pilot adapter, ML FastAPI adapter if backend-orchestrated flow is in this slice.

Avoid global `controllers/`, `services/`, `repositories/` folders that obscure Nest module/provider boundaries.

### Step 5 — API contracts
- `POST /api.alerts/events` accepts: `external_event_id`, `source_id`, `type`, `detected_at`, optional `confidence`.
- Header: `x-alert-api-key` for trusted pilot/edge ingress only.
- Duplicate requests return existing event/delivery state without creating duplicate delivery attempts or invoking `ChannelPort` again.
- Backend-orchestrated production path consumes `/predict` contract and schedules delivery only after backend policy says alert-worthy.

### Step 6 — ChannelPort and failure classification
- Introduce provider-neutral `ChannelPort` and `DeliveryResult`.
- Keep Kakao send-to-me as pilot adapter behind the port.
- Future AlimTalk adapter must map provider/dealer responses into the same result semantics.
- Retryable/transient: timeout, network, provider 5xx.
- Terminal/operator-action: 4xx, missing config, invalid token file.
- Logs must include stable event/delivery IDs and classification labels, not raw secrets.

### Step 7 — Documentation and evidence
- Update `docs/architecture.md` only after ADRs are accepted enough to reflect the new architecture overview.
- Keep `docs/research/kakao-talk-fall-alert-integration.md` as research/facts; do not rewrite it as decision text.
- Link or reference existing real Kakao receipt evidence; do not run automated real sends.
- Ensure `.env.example` documents variable names only.

## Acceptance Criteria

- [ ] Execution begins only after this pending plan receives explicit approval and a dedicated issue worktree is created with `git wt <issue#>`.
- [ ] ADRs are created/updated under `docs/decisions/` for API architecture, Nest domain layering, Postgres outbox model, and channel adapter strategy; Kakao ADR numbering does not collide with active ADR-022/023.
- [ ] Backend production flow consumes the active `/predict` contract: `{ fall_probability, operating_threshold, is_fall }`.
- [ ] `POST /api.alerts/events` accepts `external_event_id`, `source_id`, `type`, `detected_at`, optional `confidence`, and requires `x-alert-api-key`.
- [ ] Duplicate `(source_id, external_event_id)` requests are idempotent and do not create duplicate `DeliveryAttempt` rows or duplicate Kakao sends.
- [ ] Prisma schema includes `AlertEvent` and `DeliveryAttempt` with fields sufficient for audit decision, status, channel, retry count, next attempt time, provider reference, terminal reason, and operator action visibility.
- [ ] Outbox enum values, legal transitions, transaction boundary, duplicate response behavior, and dispatch timing are defined before channel adapter implementation.
- [ ] `ChannelPort` separates send-to-me pilot adapter from future AlimTalk adapter.
- [ ] Delivery classification tests prove timeout/network/5xx are retryable and 4xx/missing config/invalid token file are terminal/operator-action.
- [ ] Existing real Kakao receipt evidence is linked/reused; new real sends are manual-only and explicitly approved.
- [ ] Secret scan passes: no raw Kakao API keys, OAuth codes, access tokens, refresh tokens, bearer headers, or client-id-bearing authorize URLs are committed.

## Verification Plan For Execution

### Unit
- Alert policy/use-case tests for `/predict` response consumption: below threshold does not schedule delivery; alert-worthy response creates/schedules one delivery.
- Ingress DTO/auth tests: missing/invalid `x-alert-api-key` rejects; invalid date/type/confidence rejects.
- Idempotency tests: duplicate `(source_id, external_event_id)` returns existing state and does not invoke `ChannelPort` twice.
- Failure classification tests: timeout/network/5xx retryable; 4xx/missing config/invalid token terminal/operator-action.
- ChannelPort adapter tests use mocks only; no real network send.

### Integration
- Prisma-backed tests for unique constraints, indexes, state transitions, retry metadata, and terminal reason persistence.
- Repository/use-case integration: event and pending delivery are persisted transactionally before any channel call path.
- Backend-orchestrated flow integration with mocked ML `/predict` returning `{ fall_probability, operating_threshold, is_fall }`.

### E2E/manual
- Local e2e with mocked ML and mocked ChannelPort: one event leads to one `AlertEvent` and one `DeliveryAttempt`.
- Optional real Kakao send-to-me only with explicit manual approval; store sanitized evidence only.
- Existing real receipt evidence from the pilot PR/spec context should be reused in PR notes.

### Observability
- Logs include event IDs, delivery IDs, status transitions, and failure classifications.
- Metrics/counters, if added, distinguish accepted events, duplicates, send attempts, transient failures, and terminal failures.
- No raw token, bearer header, OAuth code, client-id-bearing authorize URL, or token file content appears in logs/fixtures/evidence.

### Secret hygiene
- Scan changed files for Kakao API keys, OAuth codes, access/refresh tokens, bearer headers, token files, and authorize URLs.
- Inspect fixtures, snapshots, and evidence artifacts for accidental raw secret capture.
- Confirm `.env.example` contains names/placeholders only.

## Deliberate Pre-mortem

1. **Duplicate fall events trigger multiple Kakao messages**
   - Cause: retrying pilot/edge client lacks stable idempotency or backend creates another delivery on duplicate.
   - Mitigation: require `external_event_id`; unique `(source_id, external_event_id)`; transactionally create event/delivery; duplicate path tests assert no second `ChannelPort` call.

2. **Token/config failure retries forever or leaks secrets**
   - Cause: missing config or invalid token treated as transient; logs capture bearer/OAuth values.
   - Mitigation: classify missing config/invalid token as terminal/operator-action; redact at adapter boundary; mock tests; secret scan; sanitized receipt evidence only.

3. **Pilot provider details leak into public/domain API**
   - Cause: `/api.alerts/events` mirrors Kakao send-to-me or ML demo internals.
   - Mitigation: domain DTO only (`source_id`, `external_event_id`, `type`, `detected_at`, `confidence`); provider config stays in adapter; ChannelPort and ADR review gate provider leakage.

## Provider Review Usage

Provider best-practice usage was read-only and gated:
- Claude Code: plan-mode read-only architectural risk pass.
- Codex CLI: read-only sandbox review; it flagged boundary drift, outbox state-machine specificity, `/predict` contract skew, and secret/worktree hygiene.
- Gemini CLI: plan approval mode review; it aligned on domain-bounded Nest modules, hybrid contracts, Postgres outbox, ChannelPort, and secret/worktree hygiene.

These provider observations are advisory evidence only. They do not bypass ralplan approval, ADR distillation, worktree rules, or final execution approval.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| ADR numbering collision with active `/predict` plan | Reserve ADR-022/023 for `serving-predict-real-inference`; start Kakao ADRs after them. |
| Outbox without explicit worker semantics becomes reliability theater | Define enum values, legal transitions, transaction boundary, duplicate behavior, and dispatch timing before adapter work. |
| Nest layering becomes boilerplate folder theater | Keep layering inside `AlertsModule`; ports/adapters only where external side effects or persistence boundaries justify them. |
| `/api.alerts/events` becomes a public auth surface | Document it as trusted pilot/edge ingress only; `x-alert-api-key` is not a general public auth strategy. |
| Send-to-me treated as production channel | ADR-027 must state pilot-only status and future AlimTalk/provider boundary. |
| Secret leakage in logs/fixtures/evidence | Redaction, mocked tests, secret scan, sanitized receipt evidence, no automated real sends. |

## Execution Approval Boundary

This plan is **pending approval**. No product-source edits, worktree creation, commits, pushes, PR work, or execution skill handoff are authorized by this plan alone. A separate explicit approval is required to begin implementation, and implementation must start from a dedicated issue worktree.
