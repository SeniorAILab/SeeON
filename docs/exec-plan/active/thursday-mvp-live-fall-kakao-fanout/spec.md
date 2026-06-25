---
slug: thursday-mvp-live-fall-kakao-fanout
status: active
date: 2026-06-17
issue: 211
related-adrs: [ADR-071, ADR-043, ADR-044]
---

> Source: `.gjc/specs/deep-interview-thursday-mvp-live-fall-kakao-auth-dashboard-agents.md`.
> This file is the git-canonical exec-plan mirror for slug `thursday-mvp-live-fall-kakao-fanout`.

# Deep Interview Spec: 목요일 MVP — 라이브 낙상 → 카카오 fan-out 알림 + 카카오 로그인/가입 + 대시보드 + AGENTS.md 웨이포인트

## Metadata
- Interview ID: 019ed409-ae5c-7000-88f2-8fd8cde221c8
- Rounds: 2 (+ Round 0 topology gate)
- Final Ambiguity Score: ~19% (early-exit; 잔여 불확실성은 "라이브 낙상이 실제로 발화하는가"라는 본질적 리스크로, 추가 질문으로 해소 불가)
- Type: brownfield
- Generated: 2026-06-17
- Threshold: 0.05
- Threshold Source: default
- Deadline: 목요일 시연 (hard)
- Status: BELOW_THRESHOLD_EARLY_EXIT (deadline-pressured, requirements 충분)
- 사용자 대면 언어: 한국어

## 핵심 진단 (사용자 질문: "내가 놓치고 있는 부분이 뭘까")
부품은 **거의 다 만들어져 있다.** 목요일 리스크는 "기능 구현"이 아니라 **끝과 끝 통합 + 외부 의존(카카오 콘솔) + 라이브 검증**이다.
- 실시간 추론(`ml/serving`, `ml/demo`), HMAC 인입(`backend/src/ingest`), 알림정책/아웃박스(`backend/src/alerts`), 카카오 send-to-me 어댑터, 카카오 OAuth 로그인(`backend/src/auth`), 대시보드 SSE(`backend/src/dashboard/sse.controller.ts`) — 전부 스캐폴딩 존재.
- 진짜 함정 3개: (1) "카카오"가 로그인/알림 두 개인데 **알림이 토큰에 묶임**, (2) **현재 설계는 OAuth 토큰을 저장 안 함**(`KakaoIdentity: tokens NOT stored`) + 알림은 **단일 토큰파일** send-to-me라 "형 폰 알림" 불가, (3) **OAuth authorize URL에 `scope=talk_message`가 없음** → send-to-me 권한 토큰을 못 받음.

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.85 | 0.35 | 0.298 |
| Constraint Clarity | 0.82 | 0.25 | 0.205 |
| Success Criteria | 0.72 | 0.25 | 0.180 |
| Context Clarity | 0.85 | 0.15 | 0.128 |
| **Total Clarity** | | | **0.810** |
| **Ambiguity** | | | **0.190** |

## Topology
| Component | Status | Description | 목요일 스코프 |
|-----------|--------|-------------|--------------|
| C1 핵심 데모 경로 (E2E) | active | 노트북 웹캠(라이브 CCTV) → Streamlit 실시간 추론 → 낙상 → `/ingest`(HMAC) → 백엔드 알림정책 → 카카오 send-to-me **fan-out(나+형)** + SSE → 대시보드 | 필수 |
| C2 대시보드 (핵심만) | active | 실시간 알림 피드 + 카메라/거주자 상태 1개 (SSE 실시간 갱신) | 필수 |
| C3 카카오 인증 (풀) | active | 로그인→가입→진입 + **per-user talk_message 토큰 저장(스키마 변경)** → 형 폰 알림 가능 | 필수 |
| C4 AGENTS.md 웨이포인트 | active | 상단에 Run/Boot 실행 섹션 추가 + 누적 컨벤션을 `docs/rules` 링크로 축약 (멀티에이전트 30초 내 구동법 도달) | 필수, C1~C3와 독립 워크스트림 |

## Established Facts
- F1: 추론 surface = **Streamlit 데모(`ml/demo`, operator mode)**. 이미 `alert_client`로 `/ingest/alerts`(HMAC)까지 붙어 검증됨. 제품 풀스택 대신 데모가 추론 구동자.
- F2: 입력 = **노트북 웹캠 라이브**(녹화 재생 아님). `CameraSource`(`cv2.VideoCapture` by index)가 `ml/util/frame_source.py`에 존재, training README도 "live webcam" 명시. **그러나 `ml/demo/seam.py`는 `VideoFileSource`만 re-export, `app.py`는 stored-video registry만 노출** → 웹캠을 Streamlit UI에 와이어링하는 작업 필요.
- F3: 낙상 분류기 학습 데이터 = **Le2i (frontal/oblique 실내 카메라: Coffee_room/Home/Office/Lecture_room)**, ceiling-view 아님. 노트북 웹캠(책상 높이 frontal)은 대략 in-distribution → **카메라 각도는 리스크 아님**. 단 clip-wise fall-F1 ≈ 0.6~0.85, 라이브 unseen 세션이라 **임계값 튜닝 + 낙상 모션 리허설**로 발화 보장 필요.
- F4: 카카오 알림 = `KakaoSendToMeChannelAdapter` → `https://kapi.kakao.com/v2/api/talk/memo/default/send` (나에게 보내기/메모 API). **토큰을 `KAKAO_TOKEN_PATH` 파일 1개**에서 읽음(per-user 아님). `DeliveryChannel` enum = `KAKAO_SEND_TO_ME`만.
- F5: send-to-me는 **토큰 주인 본인에게만** 전달. "형 폰 알림"은 형의 talk_message 토큰을 따로 저장하고 **per-user fan-out**해야 가능.
- F6: `KakaoIdentity` 모델 주석 = `/// Access/refresh tokens are NOT stored (this build)`. 토큰 미저장이 의도된 현 설계 → 이번에 **의도적으로 뒤집어야 함**(스키마 변경 + 토큰 암호화 저장).
- F7: OAuth 로그인 플로우는 **이미 코드로 동작**: `GET /auth/kakao/login` → `GET /auth/kakao/callback` → 세션 쿠키 → `orgId` 없으면 `/onboarding`, 있으면 `/dashboard`. `POST /orgs`로 시설 가입. (`backend/src/auth/auth.controller.ts`)
- F8: **`buildAuthorizeUrl`에 `scope` 파라미터 없음** (profile 기본 동의만). send-to-me용 토큰을 받으려면 authorize URL에 `scope=talk_message` (필요시 `profile_nickname`) 추가 + `exchangeCode` 결과의 `access_token` 저장 필요. (`backend/src/auth/kakao.client.ts`)
- F9: 카카오 개발단계 제약 — `talk_message` 동의는 **앱 팀원(또는 등록 테스트 사용자)만** 가능. **나 + 형 둘 다 카카오 Developers 앱에 팀원으로 등록**되어야 형이 토큰 발급/알림 수신 가능. 외부 콘솔 작업 = 리드타임 있음 = 최우선.
- F10: compose에 카카오/세션 env 이미 배선됨(`KAKAO_REST_API_KEY`, `KAKAO_REDIRECT_URI`, `SESSION_JWT_SECRET`), 기본값은 dev placeholder. 실제 시연은 root `.env`에 실키 주입 필요.

## Goal (Restated)
목요일 시연에서, **노트북 웹캠을 라이브 CCTV로 사용**해 Streamlit가 실시간 낙상을 추론하고, 낙상 발생 시 백엔드(HMAC 인입→알림정책)를 경유해 **나와 동업자 형 두 사람의 카카오톡으로 send-to-me 알림이 fan-out**되며, 동시에 **Next.js 대시보드가 카카오 로그인→가입→진입 후 실시간 알림 피드로 그 낙상을 표시**한다. 별도 독립 워크스트림으로 **AGENTS.md를 웨이포인트로 복구**(Run/Boot 실행 섹션 + 컨벤션 링크 축약)한다.

## Constraints
- 추론 surface = Streamlit 데모(operator mode). 제품 풀스택은 대시보드 표시/로그인 담당, 추론은 데모가 구동.
- 입력 = 노트북 웹캠 라이브(real-time). 녹화 재생 폴백 비채택(단, 리허설/디버그용으로 사용 가능).
- 알림 채널 = 카카오 send-to-me(메모 API) 유지. 비즈니스 채널/친구톡/알림톡 도입 안 함(검수 리드타임 회피).
- 형도 알림 수신 → per-user talk_message 토큰 **저장(스키마 변경, 암호화)** + fan-out 필수. `KakaoIdentity` "tokens NOT stored" 의도적 반전.
- 카카오 OAuth authorize에 `scope=talk_message` 추가, 콜백에서 access_token 영속화.
- 나 + 형 둘 다 카카오 Developers 앱 **팀원 등록** 선행(콘솔 작업).
- 더미/placeholder/fake fallback 금지: 추론·알림 실패 시 정직하게 실패하고 로그/대시보드에 노출.
- 대시보드는 핵심만(실시간 알림 피드 + 카메라/거주자 상태 1개). 풀 어드민 CRUD는 비범위.
- ML은 예측만, 알림정책/중복제거/webhook은 backend 경계 유지(ADR-022/023).
- repo 워크플로 준수(worktree-per-task, main 직접 작업 금지). 비밀키는 gitignored `.env`만, 커밋 금지.

## Non-Goals (목요일 비범위)
- 비즈니스 채널/친구톡/알림톡(보호자 일반 발송용 정식 채널) — 검수 리드타임으로 시연 후.
- 풀 어드민 대시보드(카메라/거주자/보호자 CRUD 전체).
- 멀티 카메라/멀티 침대 동시 시연(단일 웹캠 단일 인물 기준). #107은 별도.
- 도메인 파인튜닝(요양원 천장뷰 데이터 라벨링) — 별도 이슈.
- 토큰 자동 리프레시/장기 운영 보안 하드닝(데모 수준 암호화 저장까지만, 운영 강화는 후속).
- AGENTS.md 전면 재구조화(섹션 재배치) — 이번엔 Run/Boot 추가 + 컨벤션 링크 축약만.

## Critical Path — "지금 가장 먼저 해야 하는 것" (순서 = 의존성 순서)
> 핵심 원리: **외부 의존(리드타임) + 모든 것을 막는 long-pole 먼저.** 카카오 콘솔이 안 풀리면 C3(가입)도 C1(형 알림)도 전부 막힌다.

1. **[#0, 지금 당장] 카카오 Developers 콘솔 설정** — 앱 확인/생성, REST API 키 확보, Redirect URI 등록(`http://localhost:8080/auth/kakao/callback`), 카카오 로그인 활성화, 동의항목에 **`talk_message`(+`profile_nickname`)** 추가, **나 + 형 둘 다 팀원(테스트 사용자) 등록**. → root `.env`에 실키 주입. *(외부 리드타임, 전체 long-pole)*
2. **[C3-a] OAuth 스코프 + 토큰 저장** — `buildAuthorizeUrl`에 `scope=talk_message` 추가; 콜백에서 `access_token`(+expiry/scope) 저장. `KakaoIdentity` 스키마에 암호화 토큰 컬럼 추가 + Prisma migration. *(C1 fan-out·C3 형 알림의 해금 키)*
3. **[C1-a] per-user fan-out 발송** — send-to-me 어댑터를 토큰파일 1개 → **저장된 per-user 토큰(나+형) 순회 발송**으로 전환. 한 명 실패가 다른 명 발송 막지 않도록.
4. **[C1-b] 웹캠 라이브 소스 와이어링** — `CameraSource`를 Streamlit UI 소스 옵션으로 노출(operator mode), 노트북 카메라 index로 라이브 추론.
5. **[C1-c] 인입 경로 E2E 검증** — demo `alert_client` → `/ingest/alerts` HMAC/카메라 식별/테넌트 매칭 정상 확인.
6. **[C2] 대시보드 SSE 실시간 갱신** — 로그인 진입 후 알림 피드가 그 낙상 이벤트로 실시간 갱신되는지 확인(카메라/거주자 상태 1개 포함).
7. **[C1-d] 라이브 발화 리허설 + 임계값 튜닝** — 실제 낙상 모션이 발화하도록 threshold 조정 + 시연 동선 리허설(가장 흔한 시연 실패 모드).
8. **[C4] AGENTS.md 웨이포인트** — (병렬 가능, 독립) Run/Boot 섹션 추가 + 컨벤션 `docs/rules` 링크 축약.

## Acceptance Criteria
### C1 — 핵심 데모 경로 (E2E)
- [ ] 노트북 웹캠 라이브 프레임이 Streamlit operator mode에서 실시간 추론된다(stored-video 아님).
- [ ] 낙상 검출 시 demo `alert_client`가 `/ingest/alerts`로 HMAC 인증 POST, 백엔드가 alert 생성.
- [ ] 백엔드가 **나와 형 두 사람의 카카오톡**에 send-to-me 알림을 fan-out 발송(각자 저장된 talk_message 토큰 사용); 한 명 실패가 다른 발송을 막지 않음.
- [ ] 더미/placeholder 없음. 추론·발송 실패 시 정직 실패 + 로그/대시보드 노출.
### C2 — 대시보드 (핵심만)
- [ ] 카카오 로그인→대시보드 진입 후, 실시간 알림 피드가 SSE로 그 낙상 이벤트를 즉시 표시.
- [ ] 카메라/거주자 상태 1개 표시(연결/탐지 상태). 풀 어드민 CRUD 비범위.
### C3 — 카카오 인증 (풀)
- [ ] `GET /auth/kakao/login` authorize URL에 `scope=talk_message` 포함.
- [ ] 콜백이 access_token(+expiry/scope)을 **암호화 저장**(KakaoIdentity 스키마 변경 + migration).
- [ ] 로그인→(신규)가입(`/onboarding`+`POST /orgs`)→대시보드 진입 흐름을 화면으로 시연 가능.
- [ ] 형이 카카오로 가입 → 보호자/유저로 인식되어 fan-out 대상에 포함.
### C4 — AGENTS.md 웨이포인트
- [ ] AGENTS.md 상단(웨이포인트 근처)에 간결한 Run/Boot 섹션: 멀티에이전트가 README를 안 봐도 db/backend/ml/front 구동법에 30초 내 도달.
- [ ] 누적된 컨벤션 본문은 `docs/rules`/ADR 링크로 축약(SSOT 유지, 내용 중복 금지).
- [ ] 라우팅(웨이포인트) 기능 회복: "무엇이 어디에 있고 어떻게 돌리나"가 한눈에.

## Risks / 시연 실패 모드
| 리스크 | 영향 | 완화 |
|--------|------|------|
| 카카오 팀원 등록/talk_message 동의 누락 | 형 알림 0% (치명) | #0를 최우선·즉시. 둘 다 팀원 등록 확인. |
| 라이브 낙상이 임계값 미달로 미발화 | 데모 김빠짐 | threshold 튜닝 + 모션 리허설 + (백업)녹화 클립 폴백 준비. |
| 토큰 저장/암호화 미흡으로 비밀 노출 | 보안 | `.env`/키 gitignore, 토큰 암호화 컬럼, 커밋 금지. |
| send-to-me 토큰 만료 | 발송 실패 | 시연 직전 재로그인으로 토큰 갱신; 실패 시 정직 노출. |
| SSE 통합 미검증 | 대시보드 피드 안 뜸 | #5~#6에서 E2E 사전 검증, 대시보드는 핵심만으로 표면 축소. |
| 웹캠 권한/인덱스 문제(macOS) | 추론 입력 없음 | 카메라 권한 사전 허용 + index 확인. |

## Technical Context (위치)
- 추론: `ml/demo/app.py`(operator mode), `ml/demo/live_view.py`, `ml/util/frame_source.py`(`CameraSource`/`VideoFileSource`), `ml/demo/seam.py`(re-export), `ml/demo/alert_client.py`(→ `/ingest`).
- 분류기: Le2i 학습 `ml/models/fall/{random-forest,lstm,transformer}`(default rf), threshold = metadata.json(Recall≥0.90).
- 인입/알림: `backend/src/ingest/ingest.controller.ts`(HMAC), `backend/src/alerts/`(정책/아웃박스), `backend/src/alerts/adapters/kakao-send-to-me-channel.adapter.ts`(`memo/default/send`, `KAKAO_TOKEN_PATH`), `ports/channel.port.ts`.
- 인증: `backend/src/auth/{auth.controller,kakao.client,session.service,auth.service}.ts`, `backend/prisma/schema.prisma`(`User.kakaoId`, `KakaoIdentity`, `DeliveryChannel`).
- 대시보드: `backend/src/dashboard/sse.controller.ts`, `front/src/app/(dashboard)/`, `front/src/components/{AlertFeed,StatusBadge,SnapshotThumb}.tsx`, `front/src/app/{login,onboarding}/page.tsx`.
- 구동: README Quick Start(`pnpm install`, `cd ml && uv sync`, `pnpm db:up`, `pnpm prisma:generate`, `pnpm dev:backend|dev:ml|dev:front`, `pnpm dev:demo`). 포트: front 3000 / backend 8080 / ml-serving 8000 / db 5432.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "OAuth 로그인은 부가기능, 미뤄도 됨" | 알림이 토큰에 묶임 + authorize에 scope 없음 | OAuth는 알림의 전제. scope=talk_message + 토큰 저장 필수. |
| "회원가입하면 그 유저 폰으로 알림 감" | send-to-me는 본인에게만, 토큰파일 1개 | per-user 토큰 저장 + fan-out으로 명시적 설계 변경. |
| "노트북 웹캠은 천장뷰와 달라 탐지 안 될 것" | 분류기는 Le2i(frontal) 학습 | 각도는 OK, 리스크는 라이브 unseen 발화 → 리허설/임계값. |
| "기능을 더 만들어야 함" | 부품 거의 다 있음 | 작업의 본질 = 통합+외부의존+검증, not 신규 개발. |
| "AGENTS.md에 다 적어야 함" | 컨벤션 누적으로 웨이포인트 기능 상실 | Run/Boot만 본문, 나머지는 docs/rules 링크(SSOT). |

## 다음 단계 (handoff)
요구사항 명확(ambiguity ~19%, deadline-pressured). 구현 세부 시퀀싱이 필요하면 `/skill:ralplan`으로 C1~C4 합의 계획 → pending approval. 단일 long-pole(#0 카카오 콘솔)은 계획과 무관하게 **지금 바로** 착수 권장.
