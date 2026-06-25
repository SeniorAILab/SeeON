---
slug: api-event-contract-rest-convention-single-owner
status: active
type: brownfield
issue: 216
generated: 2026-06-18
source: deep-interview (.gjc/specs) → ralplan consensus (.gjc/plans/ralplan/2026-06-18-api-contract)
---

# Spec: front↔backend↔ml API/Event Contract 단일 소유자 + REST/레이어링 컨벤션 + 미스매치 정리

## 핵심 진단
도메인은 하나(낙상 알림)인데 코드가 컨벤션 없이 자라서 인그레스/경로/DTO/명명이 갈라졌다. 핵심 함정 3개:
1. 인그레스 이중화: `/ingest/alerts`(정식, ADR-043) vs `/api.alerts/events`(레거시 파일럿). 같은 도메인에 입구가 둘.
2. backend↔ML 계약 깨짐(M2): backend 어댑터는 `{window}` 전송 + `{fall_probability, operating_threshold, is_fall}` 기대. ML `/predict`는 `{source_id|upload_id}`만 받고(`extra=forbid`) `{model, version, fall_probability}`만 반환 → 실서버 호출 시 즉시 실패. 스펙 테스트가 fake 서버라 통과 중(거짓 안심).
3. 명명/경로 컨벤션 부재: DB 컬럼이 테이블마다 camelCase(`Alert`) vs snake_case `@map`(`AlertEvent`) 혼재. REST 경로에 `/api.alerts`(점), `/orgs`(prefix 누락), 데드 라우트(`/sse`, `/auth/me`) 혼재. 컨트롤러에 DTO/validation 레이어 부재.

해결책: docs 아래에 컨벤션을 단일 소유로 수립 → 코드를 컨벤션에 맞춤. `contracts/` 새 폴더 안 만들고 기존 `docs/{rules,api,domain,decisions}` 체계에 녹인다.

## Established Facts (grounded)
- F1: 정식 인그레스 = `/ingest/alerts` (ADR-043). `IngestController.ingestAlert`가 `writer.writeAlert()`(Alert+ResidentStatus+SSE) 그리고 `ensureOutboxForIngest()`(AlertEvent+DeliveryAttempt)를 한 요청에 모두 수행.
- F2: `/api.alerts/events`(AlertEventsController)는 레거시 파일럿. ADR-043 본문이 임시 파일럿, MVP 후 정리/재배치 명시. `@Controller('api.alerts')`+`@Post('events')`.
- F3: 테이블 분리는 의도적: `Alert`(RLS, read model, alertSeq=SSE Last-Event-ID) vs `AlertEvent`+`DeliveryAttempt`(비-RLS outbox, `(sourceId, externalEventId)` 멱등키). 같은 도메인의 읽기/발송 두 관심사.
- F4: DB 명명 불일치: `Alert/Resident/ResidentStatus/Camera/Guardian/Organization/User` = camelCase. `AlertEvent/DeliveryAttempt`만 snake_case `@map`.
- F5: backend↔ML 계약 깨짐(M2): adapter POST `/predict` `{window}` 기대 `{fall_probability, operating_threshold, is_fall}`. ML `PredictRequest {source_id|upload_id,...}`(extra=forbid), `PredictResponse {model, version, fall_probability}`.
- F6: 데드/probe 라우트: auth.controller `@Get('/sse')`(sseAuthProbe); `@Get('/auth/me')`. front는 `/api/sse`, `/auth/session`만 사용. ⚠ `/auth/me`·`/sse`는 `backend/test/auth.spec.ts`·`app-boot.spec.ts`의 세션/로테이션 probe로 사용됨 → 제거 시 테스트를 `/auth/session`(또는 잔존 probe)로 이관 필요.
- F7: 경로 prefix 불일치: POST `/orgs` vs `/api/*`. front `fetch('/orgs')` + next.config 별도 rewrite.
- F8: snapshot: backend `@Put/@Get('api/snapshots/:alertId')`, front `src=/api/snapshots/${alertId}`. 컨벤션상 `/api/alerts/:alertId/snapshot` 자연.
- F9: DTO 레이어 부재: residents/cameras/guardians 컨트롤러 인라인 타입 + validation 없음.
- F10: IngestController 로직 과적재: 검증/freshness/tenant/멱등키/P2002/outbox 모두 컨트롤러 인라인.
- F11: front 소비 경로: `/api/status`, `/api/alerts(?limit/beforeSeq)`, `/api/alerts/:id`, `/api/alerts/:id/ack`, `/api/cameras|residents|guardians`, `/api/snapshots/:alertId`, `/api/sse`, `/auth/kakao/login`, `/auth/logout`, `/auth/session`, `/orgs`.
- F12: 기존 ADR: ADR-035/036/037/038, ADR-071/043/044, ADR-022/023(ML=예측, backend=정책), ADR-009.
- F13: Kakao 자가알림 이미 배선: `kakao.client.ts buildAuthorizeUrl` scope=`talk_message profile_nickname`; `/ingest/alerts`→`ensureOutboxForIngest`→`findKakaoRecipients(orgId)`가 토큰 보유 org 유저 전원에게 per-user send-to-me fan-out. 레거시 `/api.alerts/events`(createAndDispatch)는 per-user 아님 → 제거 시 per-user 경로로 일원화.

## Decisions (확정)
- D1 스코프: 마감 없음 → cross-cutting 전면 refactor. 단 문서 선행.
- D2 backend↔ML 장기 계약 = 옵션 B + ADR-023: 엣지가 pose 추출 → pose window → backend가 ML `/predict(window)`로 낙상 분류 위임(낙상 탐지 책임=ML) → backend가 알림정책 소유. M2 수정: ML `/predict`가 `{window}`를 받고 `{fall_probability, operating_threshold, is_fall}` 반환하도록 정렬. source_id/upload_id 모드는 데모/eval용 유지.
- D3 alert vs alert-events = 같은 도메인, 단일 인그레스: `/api.alerts/events` 인그레스 제거(rename 아님). 정식 = `/ingest/alerts` 하나(ADR-043). 테이블 `Alert`(read-model)+`AlertEvent/DeliveryAttempt`(outbox) 유지. `ensureOutboxForIngest`는 `/ingest` 사용 유지.
- D4 경로 전면 정규화: `/api.alerts/events` 제거; `/orgs`→`/api/orgs`; `/api/snapshots/:alertId`→`/api/alerts/:alertId/snapshot`; 데드 `/sse` 제거; 데드 `/auth/me` 제거(테스트 이관). front+backend+tests 일괄.
- D5 DB 명명 통일 + migration: Prisma 모델 필드 camelCase + DB 컬럼 snake_case `@map`/`@@map` 전면 적용. 개발 DB는 `prisma migrate reset --force`로 리셋(사용자 승인).

## Phase 0 Gate Results (resolved 2026-06-18)
- **G-R1 = PASS → R1-A.** Geometry: `window=[T][51]` (17 COCO-17 keypoints × `[x,y,conf]`, normalized via `normalize_person_keypoints(frame_w,frame_h,CONF_THRESHOLD)`); reshape `[T,17,3]` → `extract_window_features` → **45-dim** → `FallDetector.predict_proba`. `EXPECTED_WINDOW=30`, `EXPECTED_FEATURE_DIM=45`. Response `{fall_probability, operating_threshold(metadata/default), is_fall=prob≥threshold}`. `pipeline.window_to_features` already bridges window→features. No R1-B pause needed.
- **G-D2-owner = D2-O1.** Retain `ALERT_PREDICTION_PORT` + `MlServingPredictionAdapter` in `AlertsModule` as a documented, tested, currently-unused-in-live-demo future seam; not a second alert ingress.

## Constraints
- No mocking: real component만. Fallback ≠ mock(실제 시스템 실패 시 다른 실제 입력 허용, Kakao/ML 성공 위조 금지).
- `contracts/` 금지. 모든 정책/계약 `docs/` 아래. 문서 선행 후 refactor.
- ML=예측, 알림정책=backend(ADR-022/023). expensive-to-reverse는 successor ADR 증류.
- docs가 SSOT. 전용 worktree(`git wt`, 이슈 #216), main 직접 금지. 비밀키 커밋 금지.

## Mismatch Inventory
| # | 미스매치 | 위치 | 처리 |
|---|---|---|---|
| M1 | `/api.alerts/events` 점 경로 + 이중 인그레스 | alert-events.controller.ts | 제거(D3/S2) |
| M2 | backend `{window}`↔ML `{source_id}` 계약 깨짐 | ml-serving-prediction.adapter.ts ↔ ml/serving/main.py | ML `/predict` window+응답 정렬(D2/S5) |
| M3 | SSE 데드 `/sse` | auth.controller sseAuthProbe | 제거 + 테스트 이관(D4/S3S4) |
| M4 | 세션 데드 `/auth/me` | auth.controller | 제거 + 테스트 이관(D4/S3S4) |
| M5 | DTO/validation 부재 | residents/cameras/guardians/alerts/ingest | DTO+parser 분리(S1) |
| M6 | IngestController 로직 과적재 | ingest.controller.ts | IngestAlertService(S1) |
| M7 | 경로 prefix `/orgs`, snapshot 위치 | auth/alerts controller + front | `/api/orgs`, nested snapshot(D4/S3S4) |
| M8 | DB 컬럼 명명 혼재 | schema.prisma | snake_case `@map` 통일 + migration(D5/S6) |

## Success Criteria
1. `docs/{rules,api,domain}` + 신규 ADR 생성 + 단일 소유 선언.
2. 점 경로 0, 데드 라우트 0, ingest 비즈니스 로직 누수 0, DTO 레이어 존재.
3. backend↔ML `/predict` 계약 real 호출 정합.
4. DB 컬럼 명명 단일 규칙 + migration 적용.
5. lint·typecheck·backend·front(·ml) 테스트 그린.
6. 데모 E2E: 프론트 카카오 로그인 + 내 카톡 self-notification(실키 조건부, 없으면 정직 UNAVAILABLE).

## Handoff lineage
deep-interview spec (`.gjc/specs/deep-interview-api-event-contract-rest-convention-single-owner.md`) → ralplan 2-pass consensus (`.gjc/plans/ralplan/2026-06-18-api-contract/`, APPROVED) → ultragoal execution (issue #216, this worktree). 전체 phased plan + ADR은 옆의 `plan.md` 참조.
