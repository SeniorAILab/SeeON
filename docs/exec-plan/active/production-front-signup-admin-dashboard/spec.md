---
slug: production-front-signup-admin-dashboard
status: active
issue: 102
created: 2026-06-13
source: deep-interview + ralplan
---

# Deep Interview Spec: 프로덕션 프론트엔드 — 시설 회원가입(Kakao OAuth) + 실시간 관리자 대시보드

## Metadata
- Interview ID: 359ce738-d66f-4345-9ab8-7a63669b3d83
- Rounds: 8
- Final Ambiguity Score: 8.8%
- Type: brownfield
- Generated: 2026-06-13T15:43:47Z
- Threshold: 0.05 (5%)
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED (all dimensions >= 0.9 gate)
- Challenge Modes Used: contrarian, simplifier
- Provider Cross-Reviews: 1 (codex/gpt-5.5 + gemini)
- Auto-Researched Rounds: []  | Auto-Answered Rounds: []  | Architect Failures: 0

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.92 | 0.35 | 0.322 |
| Constraint Clarity | 0.9 | 0.25 | 0.225 |
| Success Criteria | 0.92 | 0.25 | 0.23 |
| Context Clarity | 0.9 | 0.15 | 0.135 |
| **Total Clarity** | | | **0.912** |
| **Ambiguity** | | | **0.088** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 회원가입·인증 (signup-auth) | active | front 가입/로그인/세션 + backend 인증 API·사용자/조직 모델 | AC1-AC4, AC10-AC12 적용; Kakao OAuth, B2B 시설 멀티테넌시 |
| 관리자 대시보드 (admin-dashboard) | active | front 실시간 모니터링/알림 이력/관리 + backend 조회·SSE API | AC5-AC9, AC10-AC12 적용; SSE + Postgres |
| 백엔드 카카오 알림 발송 (kakao-dispatch) | deferred | backend POST /events → 정책 → 카카오 발송 | 파일럿 #96/#99가 소유. 이번 build은 alert-ingest/데이터 계약 연동만 가정 |

## Goal
B2B 요양/돌봄 시설을 대상으로 한 프로덕션 진입용 프론트엔드를 구축한다. 시설 운영자(원장)가 **Kakao OAuth로 가입/로그인**하면 본인 시설(Organization)이 생성되고 그 컨텍스트로만 진입하며(시설 단위 멀티테넌시), **실시간 NOC형 관리자 대시보드**에서 본인 시설 대상자별 실시간 상태와 낙상 알림 피드를 본다. 대시보드는 **SSE로 서버→클라 단방향 푸시**, 데이터는 **Prisma/Postgres** 도메인 모델(Organization/User/Resident/Guardian/Alert/Camera)에서 backend API로 조회한다. 웹/데이터 계층은 production급으로 즉시 구축하되 라이브 시연을 어렵게 하지 않는다(동일 /predict·alert-ingest 계약으로 시뮬 이벤트 주입).

## Constraints
- 인증 = Kakao OAuth(운영자 로그인). 카카오 발송용 talk_message scope는 이번 비대상(발송은 #96 연기).
- 멀티테넌시 = 시설 단위. 모든 보호 API/대시보드/SSE에 인증 + 시설 스코프 검사. 타 시설 데이터 격리.
- 실시간 전송 = SSE(읽기전용). WebSocket/socket.io 비채택. 운영자 액션(ack)은 REST.
- 지연 특성: 모델 판정→대시보드 sub-second; 낙상 onset→알림 ~2-8s(ML 시계열 윈도우+provider가 지배). 전송 계층 과설계 금지.
- 영속화 = Prisma/Postgres(#27). 알림 인제스트 JSONL→Postgres 승격. ML↔backend 데이터 계약: alert payload = {resident_id, facility_id, probability, snapshot_url, detected_at, type}.
- PII 최소수집: 어르신·보호자 PII는 시설이 등록·관리, 시설 스코프 내 표시. 보호자 전화번호는 발송용 저장만(이번 발송X, 마스킹 표시). 동의 플로우는 상용 follow-up.
- prod env/secrets(#38): 카카오 시크릿·DB 자격증명 env화, .env.example/backend/.env.example 갱신, 시크릿 커밋 0.
- ADR-014 fail-fast: 가짜 폴백 금지, 계약 미충족 시 타입드 예외.
- cross-cutting 결정(B2B 멀티테넌시·Kakao OAuth·Prisma 모델·SSE)은 .claude documents 스킬(documentation-and-adrs)로 docs/decisions/ADR-NNN 확정.
- 워크트리: 실행 단계에서 신규 이슈 발행 + git wt로 워크트리 생성 후 구현(ADR-008). main 직접 작업 금지.
- 멀티 프로바이더 best-practice: spec/ADR 체크포인트에서 codex exec + gemini -p(또는 omx ask) 교차 리뷰; 구현은 ralplan(Planner/Architect/Critic) 합의 후 실행.

## Non-Goals (이번 build 제외)
- 실제 카카오/알림톡 발송 (#96 send-to-me 파일럿, #76 AlimTalk) — alert-ingest 계약 연동만.
- RTSP 카메라 fleet 스케일링 / edge·GPU 오토스케일.
- 보호자 전용 포털 / 모바일 앱.
- HA 큐·멀티리전·exactly-once 알림 의미론.
- 직원 초대 / 세분 역할(RBAC) — MVP는 원장 단일 admin. (상용 follow-up)
- 상용 온보딩·서비스 모델(운영팀 프로비저닝 등) — follow-up 이슈.
- 라이브 pose 오버레이 / 실시간 영상 스트리밍 in 대시보드.

## Acceptance Criteria
- [ ] AC1 원장 카카오 OAuth 가입 시 본인 시설(Org) 생성 + owner/admin 부여, 로그인 동작
- [ ] AC2 로그인 후 본인 시설 컨텍스트로만 진입 — 타 시설 데이터 격리(멀티테넌시)
- [ ] AC3 미인증 요청 401, 모든 보호 API/대시보드/SSE에 인증+시설 스코프 검사
- [ ] AC4 카카오 토큰 안전 저장·만료 처리, 시크릿 노출 0 (ADR-014 fail-fast)
- [ ] AC5 로그인 원장이 본인 시설 대상자별 실시간 상태 + 낙상 알림 피드 확인
- [ ] AC6 낙상 이벤트(또는 시뮬 주입) 발생 시 SSE로 모델 판정→피드 표시 sub-second
- [ ] AC7 알림 이력 목록/상세 조회(Postgres), 시설 스코프 페이지네이션/필터
- [ ] AC8 SSE 재연결(Last-Event-ID)로 끊겨도 이벤트 누락 없음
- [ ] AC9 데이터 계약 준수: alert payload {resident_id, facility_id, probability, snapshot_url, detected_at, type}
- [ ] AC10 Prisma 마이그레이션+시드, pnpm typecheck/lint/backend test 통과
- [ ] AC11 cross-cutting 결정(B2B 멀티테넌시·Kakao OAuth·Prisma 모델·SSE)은 ADR로 확정(documentation-and-adrs)
- [ ] AC12 [데모] end-to-end 시연: 원장 카카오 가입→본인 시설 대시보드→시뮬 낙상 이벤트 주입(동일 /predict·alert-ingest 계약)→피드 sub-second 표시

## Assumptions Exposed & Resolved
| 가정 | 도전(Challenge) | 해소 |
|------|-----------------|------|
| 가입 주체가 자명하다 | R1: 가입자/관리자 정체 질문 | B2B 시설 운영자=admin, 어르신·보호자=관리 엔티티, 멀티테넌시=시설 |
| 대시보드 목적이 자명 | R2: 1차 핵심 화면 질문 | 실시간 NOC형 모니터링 월(대상자 상태 + 낙상 피드) |
| 카카오 단독 로그인이면 충분 | R4 Contrarian: B2B 마찰(오프보딩/개인계정 거부) | MVP는 원장 직통 셀프가입(단일 admin); 직원초대·세분역할·상용 모델은 follow-up |
| 데이터 소스 모호(JSONL vs Prisma) | R5: 영속 데이터 소스 질문 | Prisma/Postgres 도입(#27), 알림 JSONL→Postgres 승격 |
| 실시간 = WebSocket 필요 | R6 Simplifier + Codex/Gemini 교차자문 | SSE로 충분(읽기전용); 지연 병목은 ML 윈도우이지 전송 아님 |
| production은 나중 | meta: production급 즉시? | 웹/데이터 계층 production급 즉시 OK(시연 무리 없음); RTSP·AlimTalk·HA는 분리 연기 |

## Technical Context (brownfield)
- `front/`: Next.js 16.2.7 App Router + React 19 + Tailwind v4. create-next-app 스켈레톤(layout.tsx, page.tsx)만 존재. auth/대시보드/상태관리/데이터패칭 라이브러리 전무. **제품 front/를 건드리는 열린 PR 0건** → 충돌 없는 greenfield-in-front.
- `backend/`: NestJS 11 + Prisma 6 + Postgres. AppModule = ConfigModule + PrismaModule만. schema.prisma 실제 모델 0(전부 주석). 인증/컨트롤러 미구현. 관련 이슈: #27(Prisma 모델, high), #30(stream/job + dashboard event push), #36(realtime transport 결정 — 본 spec이 SSE로 해소), #37(CI), #38(prod env/secrets).
- 파일럿 #96/#99(draft): backend POST /events → JSONL audit → 정책 → 카카오 send-to-me. **비-Prisma(JSONL)** → 본 build이 Postgres로 승격(데이터 소스 정합).
- 카카오 연구: docs/research/kakao-talk-fall-alert-integration.md (Kakao Login REST, NextAuth KakaoProvider, redirect URI, scope, token TTL).
- 규약: AGENTS.md(ADR 파이프라인 research→ADR→plan), ADR-002(Postgres everywhere), ADR-014(fail-fast), ADR-008(이슈 기반 워크트리). 스펙은 .gjc 스크래치(이번 세션은 추적 파일/코드 변경 0, main 유지).

### Kakao OAuth 앱 설정 (실행 단계, human-auth gated)
> spec 승인 후 실행 단계에서 Chrome으로 developers.kakao.com 접속, 사용자 로그인 하에 단계별 설정. deep-interview(read-only)에선 콘솔 mutation 금지

- [ ] Kakao Developers 앱 생성 → REST API key 발급
- [ ] Kakao 로그인 활성화(ON)
- [ ] 플랫폼 등록(Web: http://localhost:3000 + 배포 도메인)
- [ ] Redirect URI 등록: NextAuth /api/auth/callback/kakao (또는 backend /auth/kakao/callback)
- [ ] 동의항목: 닉네임/프로필, 계정 이메일(선택) — 운영자 식별용. talk_message는 발송(#96) 단계에서만
- [ ] Client Secret 발급/사용 여부 결정
- [ ] 시크릿(REST API key/client secret) env로만, 커밋 0 (ADR-014)
- Auth gate: human-only: 사용자 Kakao Developers 계정 로그인 필요 — agent 대리 로그인 불가

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Organization(시설) | core domain | id, name | has many User, has many Resident, has many Camera |
| User(운영자/직원) | core domain | email, role, kakaoId | belongs to Organization, has KakaoIdentity |
| Resident(어르신/대상) | core domain | name, room | belongs to Organization, has many Guardian, monitored by Camera |
| Guardian(보호자) | supporting | name, phone | belongs to Resident, receives Alert |
| Alert(낙상 이벤트) | core domain | type, detected_at, status, probability, snapshot_url | about Resident, shown in dashboard feed |
| Camera(카메라/소스) | supporting | id, label | belongs to Organization, maps to Resident |
| KakaoIdentity(카카오 OAuth) | supporting | kakaoId, accessToken, refreshToken, expiresAt | belongs to User |

## Ontology Convergence
| Round | Entity Count | Stability Ratio |
|-------|-------------|-----------------|
| 1 | 5 | N/A |
| 2 | 6 | 83.3% |
| 3 | 7 | 85.7% |
| 4 | 7 | 100.0% |
| 5 | 7 | 100.0% |
| 6 | 7 | 100.0% |
| 7 | 7 | 100.0% |
| 8 | 7 | 100.0% |

## Provider Cross-Review (Codex + Gemini)
**round6-realtime-latency-architecture** — providers: codex/gpt-5.5, gemini (agreement: high (independent convergence))

- 합치: 읽기전용 NOC 대시보드 = SSE(WS 불필요). 지연 병목=ML 시계열 윈도우(~1.5-3s), 전송 아님(~50-200ms). 웹/데이터 계층은 지금 production급(SSE+Postgres+NestJS API+tenant scoping+alert schema+reconnect)으로 지어도 시연에 무리 없음(시연=동일 /predict·alert-ingest 계약으로 시뮬 이벤트 주입). onset->알림 ~2-8s(윈도우+provider 지배).
- 지금 반드시: tenant/facility scoping, alert/event schema, API contracts, SSE reconnect(Last-Event-ID), audit timestamps, basic dedup/cooldown, auth boundary
- 연기 가능: RTSP camera fleet scaling, edge/GPU autoscaling, HA queue/retry, AlimTalk biz approval(#76), exactly-once/multi-region HA
- 데이터 계약: alert payload = {resident_id, facility_id, probability, snapshot_url, detected_at, type}

## Follow-ups / Deferred (이슈 후보)
- **상용화 온보딩/멀티유저/역할/서비스 모델** — 원장 직통 카카오 셀프가입, 원장=시설 admin, 단일/최소 역할, 직원 초대·세분 역할 deferred → deferred → GitHub 이슈로 기록
- **상용 알림 전달 경로** — 파일럿 #96/#99=카카오 send-to-me; 후보 #76 알림톡(AlimTalk) → deferred → 결정 시 ADR(documentation-and-adrs)
- **ADR 확정** — Cross-cutting 결정(인증 전략, 데이터 모델/멀티테넌시, 대시보드 실시간 전송 등)은 .claude documents 스킬(documentation-and-adrs)로 docs/decisions/ADR-NNN-*.md 확정

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds)</summary>

### Round 1 — signup-auth / goal
**Q:** 가입 주체와 '관리자'는 누구인가
**A:** B2B 시설 중심: 운영자/직원이 가입, 관리자=운영자, 어르신·보호자=시설 등록 엔티티, 멀티테넌시=시설 단위
**Ambiguity:** 69.5% (goal 0.35, constraints 0.2, criteria 0.2, context 0.55)

### Round 2 — admin-dashboard / goal
**Q:** 관리자 대시보드 1차 핵심 목적/메인 화면은?
**A:** 실시간 낙상 알림 모니터링 월(NOC형): 대상자별 실시간 상태 + 낙상 이벤트 알림 피드가 메인. 실시간 전송 필요(#36 SSE/WS 결정 연동)
**Ambiguity:** 62.0% (goal 0.55, constraints 0.25, criteria 0.2, context 0.5)

### Round 3 — signup-auth / constraints
**Q:** 운영자 인증/로그인 방식은? (사용자 자발 제공)
**A:** 카카오 OAuth 로그인 지원 — 운영자 대시보드 로그인 수단으로 Kakao OAuth 사용. (카카오 알림 발송은 #96으로 연기 상태)
**Ambiguity:** 59.05% (goal 0.62, constraints 0.25, criteria 0.22, context 0.5)

### Round 4 — signup-auth / goal [contrarian]
**Q:** [Contrarian] 카카오 단독+셀프가입의 B2B 마찰 — 온보딩/역할 모델은?
**A:** MVP: B2B, 원장(director) 직통 사용 가정. 카카오 셀프가입, 원장=시설 admin, 단일/최소 역할. 직원 초대·세분 역할·정식 온보딩 및 상용 서비스 모델은 follow-up 이슈로 기록.
**Ambiguity:** 55.5% (goal 0.7, constraints 0.25, criteria 0.25, context 0.5)

### Round 5 — admin-dashboard / constraints
**Q:** 대시보드/회원가입 백엔드 데이터는 어디 저장·조회? (JSONL vs Prisma)
**A:** Option a: 이번에 Prisma/Postgres 도메인 모델 도입(#27) — Org/User/Resident/Guardian/Alert/Camera 정의·마이그레이션. 알림 인제스트 JSONL→Postgres 승격, 대시보드는 backend API로 Postgres 조회.
**Ambiguity:** 43.55% (goal 0.75, constraints 0.45, criteria 0.35, context 0.68)

### Round 6 — admin-dashboard / constraints [simplifier]
**Q:** [Simplifier] 실시간 전송 가장 단순한 충분안? + production급 즉시 가도 시연 무리 없나(속도/end-state)?
**A:** SSE + Postgres + NestJS API로 production급 즉시 진행. 전송=SSE(WS 불필요), 지연 병목은 ML 윈도우. Codex+Gemini 교차자문 수렴.
**Ambiguity:** 27.75% (goal 0.85, constraints 0.72, criteria 0.5, context 0.8)

### Round 7 — both / criteria
**Q:** 수용 기준(AC1~AC11) 확정 + 데모 시나리오?
**A:** AC1~AC11 확정 + AC12 end-to-end 데모 시연 추가
**Ambiguity:** 15.0% (goal 0.85, constraints 0.8, criteria 0.9, context 0.85)

### Round 8 — both / constraints
**Q:** 경계/비기능 제약(실시간 상태 정의·PII·prod env·non-goals) 확정?
**A:** 확정: 상태배지+최근알림+snapshot 썸네일 / PII 시설 스코프·전화번호 발송용 저장만(이번 발송X) / env화·시크릿 커밋0·fail-fast / non-goals=실발송·RTSP fleet·보호자포털·모바일·HA큐·직원초대·상용온보딩
**Ambiguity:** 8.8% (goal 0.92, constraints 0.9, criteria 0.92, context 0.9)

</details>
## Open Planning Questions (ralplan agenda — Codex+Gemini red-team)
> 요구사항 모호도가 아니라 ralplan(Planner/Architect/Critic)이 풀어야 할 설계 결정. Codex(gpt-5.5)+Gemini 교차 red-team 합치.
1. **인증 경계**: NextAuth Kakao 콜백 vs backend `/auth/kakao/callback`, 세션/JWT/쿠키 소유, CSRF, 토큰 갱신·저장, API 인증 전파.
2. **SSE 인증 수단**: 브라우저 `EventSource`는 커스텀 Authorization 헤더 불가 → 쿠키 기반 vs 쿼리 토큰 결정.
3. **Organization 생성 상세**: 시설명/사업자번호 등 메타데이터 수집 단계, 중복 시설 처리·검증, 기존 시설 합류 경로, 재로그인 vs 중복가입(아이덴티티 해소).
4. **관리 데이터 입력**: Resident/Guardian/Camera CRUD/임포트/시드 — 시설이 production 데이터를 넣는 경로 + AC.
5. **"실시간 상태" 데이터 계약**: 카메라 online/offline, 대상자 현재상태(정상/주의/낙상)·last-seen·갱신 주기·소스 정의.
6. **ML↔backend ID 프로비저닝**: alert-ingest의 facility_id/resident_id를 ML이 어떻게 사전 인지하는지 계약.
7. **Alert ingest 신뢰 경계**: /predict·alert-ingest 인증/서명, 테넌트 검증, resident-facility 정합, 멱등성, dedup/cooldown.
8. **snapshot_url 접근제어·수명주기**: PII 포함 → 저장소·Signed URL vs 프록시/인증 렌더링.
9. **AC8 SSE 재연결 의미론**: event id 순서, replay 쿼리, retention window, 테넌트 필터 백로그, 멀티인스턴스 SSE, 버퍼 레이어.
