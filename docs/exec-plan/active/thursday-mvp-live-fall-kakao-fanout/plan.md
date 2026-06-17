---
slug: thursday-mvp-live-fall-kakao-fanout
status: active
date: 2026-06-17
issue: 211
related-adrs: [ADR-042, ADR-043, ADR-044]
---

> Source: `.gjc/plans/ralplan/019ed409-ae5c-7000-88f2-8fd8cde221c8/pending-approval.md`.
> This file is the git-canonical exec-plan mirror for slug `thursday-mvp-live-fall-kakao-fanout`.

# Ralplan FINAL (pending approval) — 목요일 MVP: 라이브 낙상 → 카카오 멀티유저 fan-out + 카카오 인증 + 핵심 대시보드 + AGENTS.md 웨이포인트

상태: **pending approval** (실행 승인 별도). 모드: deliberate.
Spec: `.gjc/specs/deep-interview-thursday-mvp-live-fall-kakao-auth-dashboard-agents.md`
합의: Architect `CLEAR`/`APPROVE`, Critic `OKAY` (잔여 must-fix 0). Run: `019ed409-ae5c-7000-88f2-8fd8cde221c8`.

## 한 줄 목표
노트북 웹캠을 라이브 CCTV로 써서 Streamlit가 실시간 낙상을 추론하고, 한 번의 `/ingest/alerts`(HMAC)가 **대시보드 SSE와 나·형 두 사람 카카오톡 send-to-me fan-out을 동시에** 켜며, Next 대시보드는 카카오 로그인→가입→진입 후 그 낙상을 실시간 표시한다. + AGENTS.md에 Run/Boot 웨이포인트 복구.

## RALPLAN-DR
**Principles** P1 재사용>신규 · P2 멀티유저 first-class · P3 정직한 실패(더미 금지) · P4 보안(토큰 암호화·키 .env·무로깅) · P5 경계(ML=예측만, backend=정책/발송, Streamlit=추론 구동자).
**Decision Drivers** D1 목요일 hard deadline → 통합·검증 중심 + 외부 long-pole 우선 · D2 send-to-me는 OAuth'd User(토큰 보유)에게만 도달, Guardian은 비User 연락처라 수신 불가 → 멀티유저 알림 = org User fan-out · D3 토큰저장/스키마/수신자모델은 비싼 결정 → ADR 박제.
**채택 옵션 A** = per-user 암호화 토큰 + org-wide User fan-out + 단일 정본 인입(`/ingest/alerts`).
- 기각 B(단일 `KAKAO_TOKEN_PATH` 토큰파일): 멀티유저·형 알림 불가(P2 위반).
- 기각 C(비즈니스 채널 친구톡/알림톡으로 비User Guardian 발송): 검수 리드타임으로 목요일 불가 → 시연 후 별도.

**Pre-mortem**
- PM1 라이브 미발화 → operating threshold(metadata.json) 명시·조정 + 낙상 모션 ≥N회 리허설 + 백업 클립은 debug 라벨만(라이브 수용기준 대체 금지).
- PM2 형 폰 미수신 → Phase 0 콘솔 즉시+동의 통과 검증, 시연 직전 양쪽 재로그인 토큰 신선화, per-recipient 격리, 만료 토큰 정직표시.
- PM3 대시보드 미표시 → Phase 3 단일 정본 인입으로 구조 해결, SSE Last-Event-ID 재연결 확인, 단일 카메라/거주자.

**Expanded Test Plan**: Phase별 acceptance에 focused 테스트 명시 + 하단 검증 체크리스트(unit/integration/e2e/observability).

## 실행 계획 (PR 슬라이스 · worktree-per-task · main 직접작업 금지)

### Phase 0 — 카카오 콘솔 + 환경 (외부, 즉시·병렬, long-pole)
형을 카카오 앱 **팀원** 등록; 동의항목 `talk_message`+`profile_nickname`. redirect URI 기존 `http://localhost:8080/auth/kakao/callback` 유지(재등록 불필요; Phase 2에서 콜백을 FRONT_ORIGIN 절대 redirect로 고침). root `.env`: 실 `KAKAO_REST_API_KEY`, (선택)`KAKAO_CLIENT_SECRET`, 신규 `KAKAO_TOKEN_ENC_KEY`(32B base64/hex), `FRONT_ORIGIN=http://localhost:3000`.
**Acceptance**: 나·형 둘 다 동의화면 통과 → code 수신.

### Phase 1 — C3: OAuth scope + AES-256-GCM 토큰 암호화 저장 (auth)
`kakao.client.ts buildAuthorizeUrl`에 `scope=talk_message profile_nickname`. 신규 `token-crypto.ts`(AES-256-GCM: 키 base64/hex 디코드 후 정확히 32B 검증, 암호화마다 새 96-bit IV, authTag 동봉, payload 버전, 키부재/authTag불일치 throw, 토큰/code/bearer/authorize URL 무로깅). `schema.prisma KakaoIdentity`에 `accessTokenCipher`,`tokenScope`(+기존 `tokenExpiresAt`); migration. `auth.service completeKakaoCallback`이 암호화 토큰+expiry+scope 저장.
**Acceptance(관찰)**: authorize URL에 `scope=talk_message`; 콜백 후 DB에 cipher 존재·평문 부재(grep); focused unit — 라운드트립/키부재 throw/authTag 위변조 throw/비32B 키 throw.

### Phase 2 — OAuth/프론트/테넌트 부트스트랩 (auth + front + seed)
`auth.controller kakaoCallback` 상대 redirect → **`${FRONT_ORIGIN}/dashboard|/onboarding` 절대 redirect**(세션 쿠키는 localhost host-only라 포트 무관 공유 — 8080 콜백도 3000에서 읽힘, Architect 확인). `front/next.config.ts` rewrites에 **`/orgs`** 추가(현재 `/api`,`/auth`만). **데모 테넌트 바인딩 = admin/seed 스크립트 1개**: 나·형 `kakaoId`(첫 로그인 확보)로 `user.orgId` + `kakaoIdentity.orgId` = `demo-org-01` 설정(+필요 시 카메라/거주자 연결); 온보딩 새 org 생성에 의존 안 함. join-code UX는 후속(컷).
**Acceptance**: 나 로그인→`localhost:3000/dashboard` 착지(8080 404 아님); `/orgs` 백엔드 도달; 나·형 모두 demo-org-01 소속으로 같은 카메라/거주자 조회.

### Phase 3 — C1 정본 인입 통합 + outbox 내구성 (backend, CRITICAL)
`/ingest/alerts`(HMAC) 한 이벤트로 (a) `Alert`+`ResidentStatus`+SSE(기존 `AlertWriterService.writeAlert` 재사용) 와 (b) `AlertEvent`+org 토큰보유 User별 `DeliveryAttempt` fan-out 을 생성. 내구성 규약:
1. **created/duplicate 모두 outbox ensure/repair**: 첫 POST든 재시도(Alert P2002)든 항상 `AlertEvent`(external_event_id=기존 idempotencyKey=`sha256(camera.id|detectedAt|type)`) upsert + recipient `DeliveryAttempt` ensure. duplicate가 outbox 건너뛰지 않음.
2. **발송 전 트랜잭션 선영속화**: Kakao send 전에 `AlertEvent` + 모든 recipient `DeliveryAttempt`(PENDING)를 한 DB 트랜잭션으로 커밋.
3. **recipient별 독립 발송**: 각 recipient 복호화 토큰으로 `memo/default/send`를 bounded timeout 호출, 결과(SENT/RETRY_SCHEDULED/TERMINAL_FAILED)를 독립 기록. 한 명 실패가 타인/Alert에 무영향.
4. **silent success 금지**: writeAlert 커밋 후 outbox 선영속화 실패 시 retryable 5xx 반환 → ML 재시도가 1번 규약으로 repair. (개별 Kakao send 실패는 DeliveryAttempt 상태로 기록, 5xx 아님.)
5. **idempotency/유니크**: `AlertEvent (source_id, external_event_id)` 유니크(기존) + `DeliveryAttempt (alertEventId, recipientUserId)` 유니크 추가 → recipient별 1건 + repair upsert. `recipientUserId`(+index, User relation).
6. `KAKAO_TOKEN_PATH` fallback 제거. `api.alerts/events`는 파일럿 잔존(데모 비경로).
**Acceptance(관찰)**: 동일 이벤트 2회 POST(created+duplicate) → AlertEvent 1 + DeliveryAttempt 정확히 2; 1st outbox 선영속화 실패 주입 → ingest 5xx, 재시도 후 outbox 완성; send 직전 모든 recipient PENDING 존재; 1명 토큰 만료 → 그 1건만 TERMINAL_FAILED, 다른 1건 SENT, Alert/SSE 정상. focused 통합테스트로 검증.

### Phase 4 — ML demo alert_client → `/ingest/alerts` HMAC 마이그레이션 (ml/demo)
payload: `resident_id,facility_id,probability,detected_at,type`. 헤더: `X-Ingest-Key-Id,X-Ingest-Timestamp,X-Signature`(hex HMAC-SHA256). canonical=`{resident_id}|{facility_id}|{type}|{detected_at}`; **서명키 = `sha256(rawSecret)`** (= seed가 저장하는 `ingestSecretHash`; 데모는 `hashlib.sha256(secret).hexdigest()`를 HMAC 키로). env: `ALERT_API_URL`→`http://localhost:8080/ingest/alerts`, 신규 `INGEST_KEY_ID`/`INGEST_SECRET`(seed 출력), `ALERT_EVENTS_API_KEY` 제거.
**Acceptance**: 데모 fall→201; 음성(서명 불일치→InvalidSignature, org 불일치→TenantMismatch) focused 테스트.

### Phase 5 — C1 웹캠 라이브 소스 (ml/demo)
`seam.py`에 `CameraSource` re-export; `app.py`/`demo_ui.py` operator mode 소스 선택에 "노트북 카메라(index)" 옵션 + 라이브 추론.
**Acceptance(관찰)**: 선택 소스 타입 `CameraSource`; 프레임 index 디바이스에서 advancing; 등록 비디오 경로 미사용.

### Phase 6 — C2 핵심 대시보드 + C1-d 리허설 (검증)
대시보드 핵심만: 실시간 알림 피드(`AlertFeed`/SSE) + 카메라/거주자 상태 1개(`StatusBadge`). 리허설: operating threshold 문서화 + 라이브 낙상 ≥N회 발화.
**Acceptance**: 로그인→웹캠 낙상→나+형 카톡 2건 + 대시보드 피드에 해당 alert id 표시; 리허설 발화 ≥N.

### Phase 7 — C4 AGENTS.md Run/Boot 웨이포인트 (독립, 검증 후)
정정된 라우트 계약(콜백 절대 redirect, `/orgs` rewrite, `/ingest` HMAC, 데모 env) **검증 후에만** 작은 "Run / Boot" 섹션 추가(깨진 부트경로 인코딩 방지). 대대적 컨벤션 정리는 데모 후로 컷.
**Acceptance**: 타임드 체크리스트로 멀티에이전트가 db/backend/ml/front+demo 구동 도달; 중복 없음.

## 의존성 / Critical Path
Phase 0 ∥ 전부. 1→2, 1→3, 3→4, 4∥5, (3·4·5)→6, 7←6.
**Critical path: 0 → 1 → 3 → 4 → 6.**

## 검증 체크리스트
- root: `pnpm typecheck`, `pnpm lint`.
- backend: `pnpm --filter backend test` — token-crypto(라운드트립/키부재/위변조/비32B), authorize scope, callback 암호화 저장, ingest HMAC+tenant mismatch, **통합 alert+outbox 단일 이벤트 + created/duplicate idempotency + outbox-fail→5xx→retry repair + pre-send PENDING + 1-recipient 실패 격리**.
- ml: `uv run --directory ml pytest`(alert_client HMAC 서명/음성, camera source) + `ruff`.
- front: `/orgs` proxy 도달 + 로그인 redirect(3000/dashboard) 수동 확인.
- E2E 수동 리허설: 로그인→바인딩→웹캠 낙상→나+형 카톡 2건→대시보드 피드.
- 보안: 평문 토큰/시크릿 커밋·로그 부재 grep.

## 목요일 스코프 컷 (명시)
유지: 1 웹캠 / 1 카메라 / 1 거주자 / 나+형 2 유저 / org-wide fan-out / 최소 대시보드.
컷: resident별 라우팅·구독, refresh-token 저장/로테이션, join-code UX(→admin/seed 1스크립트), 대시보드 CRUD/폴리시, AGENTS 대청소(작은 Run/Boot만), 백업클립 라이브 위장, `api.alerts/events` 데모 사용.

## ADR (실행 후 distill 대상)
**Decision**: 목요일 MVP는 (1) Kakao per-user access token을 AES-256-GCM으로 암호화 저장(`KakaoIdentity`)하여 "tokens NOT stored" 결정을 반전하고, (2) `/ingest/alerts`(HMAC)를 **단일 정본 인입**으로 삼아 RLS `Alert`/SSE read-model과 `AlertEvent`/per-recipient `DeliveryAttempt` outbox를 한 idempotent 이벤트로 생성하며, (3) send-to-me 알림을 **같은 org의 OAuth'd User 집합**에 fan-out 한다.
**Drivers**: 목요일 deadline; send-to-me는 토큰 보유 User에게만 도달; Guardian은 비User; 분리된 두 alert 평면이 한 낙상에서 동시 발화하지 않는 구조 결함.
**Alternatives considered**: 단일 토큰파일(멀티유저 불가) 기각; 비즈니스 채널(검수 리드타임) 목요일 비채택; resident-linked 수신자 모델(신규 product 모델 필요) follow-up; 두 인입 API 분리 유지(수동 이중 발송) 기각.
**Why chosen**: 기존 auth/SSE/alert-writer/channel-port/frame-source seam 재사용으로 최소 변경, send-to-me 제약과 정합, 멀티테넌트(org/RLS) 정합, 한 이벤트 단일 인입으로 대시보드+카카오 동시 보장.
**Consequences**: KakaoIdentity에 암호화 토큰 컬럼 + 키 관리 책임; DeliveryAttempt에 recipientUserId + (alertEventId,recipientUserId) 유니크; `/ingest/alerts`가 outbox 책임까지 보유(orchestration); ML alert_client가 HMAC 계약으로 이동.
**Follow-ups**: refresh-token 저장/로테이션; 키 로테이션; resident-linked 수신자 라우팅; 비User Guardian 비즈니스 채널 발송; `api.alerts/events` 파일럿 정리; AGENTS.md 컨벤션 대정리.

## 해소된 Open Items
Q1 ingest는 현재 `Alert`만 생성 → Phase 3 통합으로 해결. Q2 수신자=org-wide 토큰보유 User 채택(resident-linked는 follow-up). Q3 refresh-token follow-up; 목요일은 재로그인 신선화+만료 정직표시.

## 실행 핸드오프
승인 시 기본 경로 = `/skill:ultragoal`(goal-tracked 실행). tmux 병렬 워커가 필요할 때만 `/skill:team`. 직접 구현 금지. **단일 long-pole(#0 카카오 콘솔)은 승인과 무관하게 지금 바로 착수 권장.**
