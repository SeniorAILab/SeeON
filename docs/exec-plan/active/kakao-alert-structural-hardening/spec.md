---
slug: kakao-alert-structural-hardening
title: "Kakao Alert Structural Hardening"
type: spec
date: 2026-06-13
owner: gobeumsu
issue: 29
status: active
source: .gjc/specs/deep-interview-kakao-alert-structural-hardening.md
---

# Deep Interview Spec: Kakao Alert Structural Hardening

## Metadata
- Interview ID: 019ec173-0e45-7000-9bc1-kakao-structural-hardening
- Rounds: 11
- Final Ambiguity Score: 3.05%
- Type: brownfield
- Generated: 2026-06-13
- Threshold: 0.05
- Threshold Source: default
- Initial Context Summarized: yes
- Status: PASSED
- Auto-Researched Rounds: []
- Auto-Answered Rounds: [2]
- Architect Failures: 0

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.98 | 0.35 | 0.3430 |
| Constraint Clarity | 0.97 | 0.25 | 0.2425 |
| Success Criteria | 0.96 | 0.25 | 0.2400 |
| Context Clarity | 0.97 | 0.15 | 0.1455 |
| **Total Clarity** | | | **0.9695** |
| **Ambiguity** | | | **0.0305** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| ML/FastAPI → Backend 이벤트/API 계약 | active | Production path에서 backend가 FastAPI `/predict`를 호출하고, pilot/edge path에서 trusted ingress `/api.alerts/events`를 받을 수 있게 두 계약을 분리한다. | `/predict`는 existing serving-predict plan의 `{fall_probability, operating_threshold, is_fall}`를 소비한다. `/api.alerts/events`는 `external_event_id` 기반 idempotency를 포함한다. |
| Backend Alert Ingress + Policy Core | active | Nest backend를 도메인 단위 module로 나누고, 각 domain 내부에 controller/service/repository/ports/adapters를 둔다. | Alert policy, dedup/rate-limit, AlertEvent/DeliveryAttempt persistence, retry-ready outbox 상태 전이를 backend 소유로 고정한다. |
| Kakao 발송 채널 + 토큰/실패 처리 | active | send-to-me는 pilot adapter로 유지하고, production-ready ChannelPort/Outbox/Retry/AlimTalk-ready 구조를 만든다. | transient(timeout/network/5xx)만 retry, 4xx/missing config/invalid token file은 terminal + operator action. |
| 운영/검증/시크릿 위생 | active | 실제 Kakao send-to-me receipt는 이미 확인된 evidence로 재사용하고, 반복 검증은 mock/contract/secret scan 중심으로 둔다. | 실행은 전용 worktree에서만 시작하며, ralplan plan과 ADR 확정 후 execution approval을 받아야 한다. |

## Goal
KakaoTalk fall alert pipeline을 production-grade layered architecture로 재정의한다. Backend가 product decision, persistence, delivery orchestration을 소유하고, ML/FastAPI는 prediction contract를 제공하며, pilot/edge ingress와 Kakao send-to-me proof는 버리지 않고 명시적 adapter/contract로 격리한다.

## Constraints
- Deep-interview ambiguity threshold는 5%이며 최종 ambiguity는 3.05%로 통과했다.
- 구현은 이 단계에서 하지 않는다. 실행은 별도 승인 후 전용 worktree에서 시작한다.
- Production 기본 경로는 backend-orchestrated다: backend → FastAPI `/predict` → backend policy/outbox/delivery.
- ML/FastAPI push 경로는 demo/live pilot/edge-camera adapter용 trusted ingress로만 유지한다.
- `/predict` 계약은 active plan `docs/exec-plan/active/serving-predict-real-inference`를 dependency로 둔다.
- Nest layering은 도메인 단위 module을 기본으로 한다. 각 module 내부에 controller, service/use-case, repository, port, adapter 개념을 둔다.
- `AlertEvent`와 `DeliveryAttempt`는 Postgres/Prisma schema로 모델링한다. 실제 background worker 구현은 후속 가능하지만 상태 전이는 이번 구조에 포함한다.
- `/api.alerts/events`는 `external_event_id`를 payload에 포함하고 `(source_id, external_event_id)` unique로 idempotency를 보장한다.
- `ChannelPort`는 send-to-me pilot adapter와 future AlimTalk adapter를 분리한다.
- Kakao send-to-me env/token은 이미 존재하고 real send는 확인 완료다. 반복 자동화에서 raw secret이나 real send를 남발하지 않는다.
- API/data-model/architecture 규약 확정 시 `.claude/skills/documentation-and-adrs/SKILL.md`를 사용해 ADR을 작성 또는 갱신한다.

## Non-Goals
- 지금 단계에서 product code 구현, worktree 생성, commit, push, PR 수정은 하지 않는다.
- AlimTalk provider adapter 구현과 SMS failover 구현은 이번 스펙의 필수 구현이 아니다. 구조는 AlimTalk-ready로 만든다.
- Background delivery worker 완성은 필수가 아니다. Retry-ready schema/state transition까지가 최소 production 구조다.
- 기존 real Kakao receipt를 매번 새로 보내서 갱신하지 않는다.
- `/predict` 계약을 event-level response로 확장하지 않는다.

## Acceptance Criteria
- [ ] Execution begins only after ralplan consensus and explicit execution approval, from a dedicated issue worktree.
- [ ] ADR(s) are produced or updated with `.claude/skills/documentation-and-adrs/SKILL.md`, covering API architecture, Nest domain layering, Postgres outbox model, and channel adapter decision.
- [ ] Backend production flow consumes existing `/predict` contract: `{fall_probability, operating_threshold, is_fall}`.
- [ ] Trusted ingress `POST /api.alerts/events` accepts `external_event_id`, `source_id`, `type`, `detected_at`, optional `confidence`, and requires `x-alert-api-key`.
- [ ] Duplicate `(source_id, external_event_id)` requests are idempotent and do not create duplicate delivery attempts or duplicate Kakao sends.
- [ ] Prisma schema includes `AlertEvent` and `DeliveryAttempt` with enough fields to audit decision, status, channel, retry count, next attempt time, and terminal reason.
- [ ] Delivery classification tests prove timeout/network/5xx are retryable and 4xx/missing config/invalid token file are terminal/operator-action.
- [ ] ChannelPort separates send-to-me pilot adapter from future AlimTalk adapter.
- [ ] Tests cover `/predict` contract consumption, `/api.alerts/events` contract, Prisma outbox state transitions, channel failure semantics, and secret hygiene.
- [ ] Secret scan passes; no raw Kakao API keys, OAuth codes, access tokens, refresh tokens, bearer headers, or client-id-bearing authorize URLs are committed.
- [ ] Existing real Kakao receipt evidence is linked/reused; new real sends are manual-only and explicitly approved.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| ML service should push alerts directly to backend | Production ownership becomes unclear if ML owns event creation. | Hybrid: production is backend-orchestrated; ML push remains trusted pilot/edge ingress. |
| Nest layered architecture maps directly to generic controller/service/repository folders | Nest convention is module/provider-first and can become boilerplate if over-applied. | Use domain-bounded Nest modules; inside each domain keep controller/service/repository/ports/adapters. |
| Send-to-me Kakao path can be production channel | Research says Kakao Developers Message API is PoC-friendly but structurally weak for production notifications. | Keep send-to-me as pilot adapter; build ChannelPort/Outbox/Retry/AlimTalk-ready boundary. |
| Real Kakao send must be repeated for every verification | Repeating real sends increases secret and external side-effect risk. | Reuse existing receipt evidence; automate mock/contract/secret-scan gates. |
| Audit JSONL is enough for production | Production retry/idempotency requires durable state. | Add Postgres `AlertEvent` + `DeliveryAttempt`; background worker may be follow-up. |

## Technical Context
- `docs/architecture.md` defines the responsibility boundary: ML returns predictions; backend owns alert policy, dedup, webhook/Kakao dispatch, and persistence.
- `docs/research/kakao-talk-fall-alert-integration.md` identifies Kakao Developers Message API as PoC-viable but production notifications should move toward Kakao Business/AlimTalk via provider/dealer.
- Open PR worktree `feat/96-feat-pilot-real-backend-driven-kakaotalk-fall-aler` already contains `backend/src/alerts/*`, including `AlertEventsController`, `AlertPolicyService`, `AlertEventsService`, `AlertChannelService`, `KakaoSenderService`, and `ml/demo/alert_client.py`.
- Final PR evidence says real Kakao send-to-me delivery succeeded and user receipt was confirmed.
- `.claude/skills/documentation-and-adrs/SKILL.md` says expensive-to-reverse API architecture, data model, auth/channel strategy decisions must be captured in ADRs under `docs/decisions/`.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| PredictionContract | API contract | `/predict`, `fall_probability`, `operating_threshold`, `is_fall` | Backend consumes existing serving-predict plan. |
| AlertEventIngress | Trusted adapter API | `/api.alerts/events`, `x-alert-api-key`, `external_event_id` | Idempotently creates AlertEvent. |
| AlertEvent | Postgres model | `source_id`, `external_event_id`, `type`, `detected_at`, `confidence`, `decision` | Unique `(source_id, external_event_id)`; has many DeliveryAttempts. |
| DeliveryAttempt | Postgres outbox/audit model | `status`, `channel`, `attempt_count`, `next_attempt_at`, `terminal_reason` | Records retry-ready delivery state. |
| TransientFailure | Retry class | timeout, network, 5xx | Schedules retry. |
| TerminalFailure | Operator-action class | 4xx, missing config, invalid token file | Stops retry and surfaces operator action. |
| BoundedContextModule | Nest module boundary | controller, service, repository, ports, adapters | Domain unit structure for implementation. |
| ChannelPort | Interface | provider-neutral send contract | Implemented by send-to-me pilot and future AlimTalk. |
| Worktree | Execution workflow boundary | dedicated issue worktree | Required before implementation. |
| ADRWorkflow | Documentation constraint | documentation-and-adrs skill, docs/decisions | Captures API/data-model/channel architecture decisions. |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|--------------|-----|---------|--------|-----------------|
| 1 | 4 | 4 | - | - | - |
| 2 | 7 | 3 | 2 | 2 | 57% |
| 3 | 9 | 2 | 0 | 7 | 78% |
| 4 | 10 | 2 | 0 | 8 | 80% |
| 5 | 10 | 2 | 0 | 8 | 82% |
| 6 | 10 | 2 | 0 | 8 | 86% |
| 7 | 10 | 1 | 0 | 9 | 90% |
| 8 | 8 | 0 | 1 | 7 | 90% |
| 9 | 8 | 2 | 0 | 6 | 88% |
| 10 | 10 | 1 | 0 | 9 | 94% |
| 11 | 8 | 1 | 0 | 7 | 95% |

## Interview Transcript
<details>
<summary>Full Q&A (11 rounds)</summary>

### Round 0
**Q:** Topology confirmation: 4 components로 진행할까?
**A:** 맞다 — 이 4개 컴포넌트로 진행.
**Ambiguity:** not scored.

### Round 1
**Q:** API는 어떤 architecture로 보는가?
**A:** API는 docs처럼 layered architecture로 생각한다.
**Ambiguity:** 66.25%.

### Round 2
**Q:** Layered architecture의 호출 방향은 backend-orchestrated, ML-push, hybrid 중 무엇인가?
**A:** 사용자가 professional production default를 물었고, architect-assisted answer로 hybrid를 채택: production은 backend→FastAPI `/predict`, pilot/edge는 ML→backend `/api.alerts/events`.
**Ambiguity:** 63.25%.

### Round 3
**Q:** Kakao 발송 채널의 production target은 어디까지인가?
**A:** send-to-me는 pilot adapter로 유지하고 ChannelPort/Outbox/Retry/AlimTalk-ready 구조까지 포함.
**Ambiguity:** 60.75%.

### Round 4
**Q:** Nest backend layering granularity는 무엇인가?
**A:** 도메인 단위로 나누고 그 안에 controller, service, repository 개념을 둔다. 실행은 worktree에서 해야 한다.
**Ambiguity:** 54.50%.

### Round 5
**Q:** Production-ready verification bar는 무엇인가?
**A:** Kakao env/token은 저장되어 있고 send-to-me는 이미 확인됐다.
**Ambiguity:** 36.00%.

### Round 6
**Q:** 최소 production-level persistence/outbox 범위는 어디까지인가?
**A:** Postgres audit + retry-ready outbox. AlertEvent/DeliveryAttempt schema와 상태 전이는 포함, background worker는 후속.
**Ambiguity:** 27.25%.

### Round 7
**Q:** `/predict` 계약은 기존 plan을 쓸까, event-level로 확장할까?
**A:** 기존 `/predict` plan을 dependency로 두고 backend는 `{fall_probability, operating_threshold, is_fall}`만 소비.
**Ambiguity:** 19.25%.

### Round 8
**Q:** `/api.alerts/events` idempotency는 어떻게 할까?
**A:** payload에 `external_event_id`를 추가하고 `(source_id, external_event_id)` unique 처리.
**Ambiguity:** 13.75%.

### Round 9
**Q:** Channel delivery failure semantics는 어떻게 할까?
**A:** transient(timeout/network/5xx)만 retry, 4xx/missing config/invalid token file은 terminal + operator action.
**Ambiguity:** 9.25%.

### Round 10
**Q:** 최종 acceptance gate는 무엇인가?
**A:** 전용 worktree + ralplan plan, `/predict`/`/api.alerts/events` contract tests, Prisma schema/outbox tests, transient/terminal channel tests, secret scan, 기존 real Kakao receipt 재사용.
**Ambiguity:** 4.40%.

### Round 11
**Q:** 추가 규약/ADR 확정 방식?
**A:** `.claude/skills/documentation-and-adrs/SKILL.md`를 써서 ADR을 확정한다.
**Ambiguity:** 3.05%.

</details>
