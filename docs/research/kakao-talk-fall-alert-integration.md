# Kakao(KakaoTalk) 낙상 알림 전송 — 조사 결과

> Research artifact — facts and options only; no decision is made here.
> Compiled: 2026-06-10. Decision (channel choice, provider choice, queue architecture) belongs in a future ADR.

## Question

낙상 탐지 시(ML serving이 `fall_probability` 반환 → backend가 alert 판정) 보호자에게 카카오톡 메시지를
어떻게 보낼 수 있는가? 그리고 이것이 backend(NestJS)·frontend(Next.js)·ML serving과 어떻게 연결되어야 하는가?

## TL;DR (findings, not a decision)

1. **카카오톡으로 서버가 보호자에게 메시지를 보내는 경로는 사실상 두 갈래**다:
   - **메시지 API** (developers.kakao.com, OAuth 기반) — 기술적으로 가능하지만 Kakao 공식 FAQ가
     "서비스가 사용자에게 보내는 알림은 메시지 API가 아니라 Kakao Business 알림톡을 쓰라"고 명시.
     쿼터 상향 불가, 비즈앱 심사에서 "user-initiated 발송 시나리오" 입증 요구.
   - **알림톡(AlimTalk, Kakao BizMessage)** — 서버 발신 알림용으로 설계된 공식 경로. 전화번호만으로
     발송(친구추가 불필요), 단 사업자등록 + 카카오톡 비즈니스 채널 + 템플릿 사전 승인 + 공식 딜러사
     (SOLAPI, NHN Cloud, Aligo 등) 경유가 필수.
2. **친구톡(FriendTalk)은 2025-12-31 종료** → 2026-01-01부터 "브랜드메시지"로 대체. 긴급 알림 용도로는
   알림톡이 유일한 비즈메시지 채널.
3. 통합 지점은 architecture.md가 이미 정의한 대로 **backend가 전담**: alert policy(threshold/dedup/rate-limit)
   판정 후 Postgres에 영속화하고 발송 디스패치. 신뢰성 패턴 선택지는 outbox+queue / direct queue /
   pg-native queue 세 가지, SMS failover는 어느 경로든 필수에 가깝다.

---

## 1. 경로 A — Kakao Developers 메시지 API (OAuth/SDK 경로)

### 1.1 API 패밀리

| 용도 | 엔드포인트 (kapi.kakao.com) | 수신자 |
|---|---|---|
| 나에게 보내기 (기본 템플릿) | `POST /v2/api/talk/memo/default/send` | **토큰 소유자 본인만** |
| 나에게 보내기 (커스텀 템플릿) | `POST /v2/api/talk/memo/send` | 토큰 소유자 본인만 |
| 친구에게 보내기 (기본 템플릿) | `POST /v1/api/talk/friends/message/default/send` | 친구 UUID 최대 5명/호출 |

- 인증: 사용자 **OAuth access token** (`Authorization: Bearer`), API 키가 아님. Admin key로는 발송 불가.
- 필요 scope: `talk_message` (발송), `friends` (친구 UUID 조회 — 친구에게 보내기 시).
- Content-Type은 `application/x-www-form-urlencoded` (JSON body는 400).

### 1.2 "친구에게 보내기"의 전제 조건 (낙상 알림에 치명적인 마찰 지점)

- **보호자도 우리 앱의 카카오 로그인 사용자**여야 하고 `friends` scope에 동의해야 친구 목록 API에 나타남.
- 메시지는 **어르신(토큰 소유자) 계정 명의로 발신**된 것으로 보임 — 서비스 명의가 아님.
- **비즈 앱 전환 + "카카오톡 친구/메시지" 추가 기능 심사** 필수. 심사 시 "사용자가 피커/UI로 수신자를
  직접 선택해 보내는" user-initiated 시나리오를 입증해야 함. 서버 자동 발송 시나리오는 이 모델에 부합하지 않음.
- 심사 전에는 **팀원 계정끼리만** 호출 가능 (샌드박스 제약).

### 1.3 쿼터 (상향 신청 불가 — 문서 명시)

| 쿼터 | 한도 |
|---|---|
| 일일 전체 | 30,000건/일 |
| 발신자당 | 100건/일 |
| 수신자당 | 100건/일 |
| 발신-수신 쌍당 | **20건/일** |
| 월간 (전체 API 합산) | 3,000,000건/월 |

### 1.4 토큰 수명 — 서버 발신(offline) 가능성

| 토큰 | TTL |
|---|---|
| Access token | REST API 기준 6시간(개요 문서) vs 응답 예시 `expires_in: 43199`(≈12시간) — **문서 간 불일치, 실측 필요** |
| Refresh token | 60일 (`refresh_token_expires_in: 5184000`); 잔여 1개월 미만일 때만 갱신 발급 |

- 서버에 refresh token을 저장해 두면 사용자가 부재해도 갱신(`POST https://kauth.kakao.com/oauth/token`,
  `grant_type=refresh_token`) 후 발송하는 offline 패턴이 **기술적으로는 가능**.
- 단 refresh token이 60일이므로 **약 2개월마다 재로그인 필요** — 상시 무인 운영에 구조적 한계.

### 1.5 SDK 지원 현황

| 플랫폼 | 공식 SDK |
|---|---|
| JavaScript(브라우저) / Android / iOS / Flutter | 있음 |
| **Node.js / Python (서버)** | **없음 — REST API 직접 호출만 가능** |
| React Native | 없음 (REST만) |

즉 "kakao SDK"는 클라이언트(로그인·공유 UI)용이고, **backend 발송은 어느 경로든 REST 호출**이다.

### 1.6 정책 제약 (핵심)

Kakao 메시지 API FAQ 원문:

> "For purposes such as order and delivery notification information where the **service sends messages to
> users**, use notification messages provided by **Kakao Business** rather than the Kakao Talk Message API."

→ 서버 발신 낙상 알림은 메시지 API의 설계 의도 밖이며, 비즈앱 심사 통과 가능성도 낮다.
헬스케어 긴급 알림에 대한 예외 승인 사례는 공개 문서에 없음 (미확인 — Kakao 지원 문의 필요).

### 1.7 경로 A가 그래도 유효한 단 하나의 변형

**"나에게 보내기"를 보호자 본인 토큰으로 사용**: 보호자가 우리 앱에 카카오 로그인하고 `talk_message`만
동의하면, 서버가 보호자의 토큰으로 보호자 자신의 "나와의 채팅"에 메모를 보냄.
- 장점: 친구 관계·비즈앱 친구/메시지 권한 불필요, 사업자등록 불필요, 무료. PoC/데모에 적합.
- 단점: 60일 refresh token 만료, 쿼터 제한, "나와의 채팅"이라 알림 시인성 낮음, 여전히 정책상
  service-initiated 알림이라는 회색 지대.

## 2. 경로 B — 알림톡 (AlimTalk, Kakao BizMessage)

서버 발신 알림용 공식 경로. 카카오는 알림톡 API를 기업에 직접 제공하지 않고 **공식 딜러사 경유**만 허용.

### 2.1 특성

| 항목 | 내용 |
|---|---|
| 수신 요건 | 전화번호만 (카카오톡 가입자면 수신; **친구추가 불필요**) |
| 발신 명의 | 우리 서비스의 카카오톡 채널 (브랜딩·버튼 포함) |
| 내용 | 정보성/거래성만; **템플릿 사전 승인** 필수 (심사 ~2영업일, 승인 후 수정 불가) |
| 템플릿 카테고리 | 화이트리스트에 **"안전/보안" 카테고리 명시 존재** — 낙상 긴급 알림이 정확히 부합 |
| 야간 제한 | 20:50–08:00 발송 제한 규정 존재 — **안전 카테고리 면제 여부 미확인 (딜러사 확인 필요)** |
| 글자수 | 기본 1,000자 |
| 친구톡 | 2025-12-31 종료 → 브랜드메시지로 대체 (광고성, 채널 친구 필요 — 긴급 알림 부적합) |

### 2.2 전제 조건과 리드타임

1. **사업자등록번호 필수** — 순수 개인은 불가. 일반 채널로는 알림톡 발송 불가.
   (개인사업자 등록 → 비즈니스 채널 전환이 최소 경로, 채널 승인 1–3영업일)
2. 카카오톡 채널 개설 + 비즈니스 채널 승인 → 발신프로필 키 발급
3. 딜러사 계약 + 템플릿 등록/승인 (~2영업일)
4. 총 리드타임 약 1–2주.

### 2.3 딜러사 비교 (Node.js 관점)

| 딜러사 | Node.js 지원 | 알림톡 단가(기본, VAT별도) | SMS failover |
|---|---|---|---|
| **SOLAPI** | 공식 `solapi` npm (v6, TS) + `@redredgroup/nestjs-solapi` | ₩13/건 (볼륨 시 ₩5.5까지) | 건별 옵션 |
| NHN Cloud | REST + `X-NC-API-IDEMPOTENCY-KEY` 멱등성 헤더, 웹훅 | 비공개(영업 문의) | 자동 fallback |
| Aligo | REST만 (npm 없음) | ~₩6.5/건 (패키지가 추정, 미확인) | `failover=Y` |
| PopBill | `popbill` npm | — | 지원 |
| Kakao i Connect Message | REST/Agent | 비공개 | 알림톡→RCS→SMS 체인 |

- 비용 감각: 알림톡 ₩13 < SMS ₩18 < LMS ₩45 (SOLAPI 기준). 알림톡이 SMS보다 싸다.
- 모든 주요 딜러사가 **전송 결과 웹훅**(delivered/failed/차단) 제공.
- 지연: SLA 공표 없음. 활성 사용자에겐 푸시 수준(초 단위)으로 추정되나 **하드 리얼타임 보장 없음** —
  긴급 채널 단독 사용 부적합, SMS failover 병행이 정석.

### 2.4 발송 코드 형태 (SOLAPI 예 — 검증 전 참고용)

```ts
import { SolapiMessageService } from 'solapi';
const svc = new SolapiMessageService(API_KEY, API_SECRET);
await svc.send({
  to: guardianPhone,
  from: serviceNumber,            // SMS failover 발신번호
  kakaoOptions: {
    pfId: SENDER_PROFILE_KEY,     // 비즈니스 채널 발신프로필
    templateId: APPROVED_TEMPLATE_ID,
    variables: { '#{이름}': elderName, '#{감지시각}': detectedAt },
  },
  text: '[낙상감지] 어르신 낙상이 감지되었습니다. 즉시 확인 바랍니다.', // failover 본문
});
```

### 2.5 국내 선례

- 정부 **응급안전안심서비스**(독거노인 ICT 낙상/화재 감지)가 최대 규모 선례이나 통지 채널(SMS/알림톡/앱푸시)은
  공개 문서에 미명시.
- 경기/인천 **AI 돌봄로봇 + 낙상알림시스템 시범사업**(2024–) — "보호자에게 긴급 알림" 명시, 채널 미명시.
- 상용 케어 서비스가 "낙상 알림을 알림톡으로 보낸다"고 공개 문서화한 사례는 **발견되지 않음** (미확인).
  시장은 긴급 이벤트엔 앱 푸시/SMS, 정기 리포트엔 알림톡을 쓰는 경향으로 추정.

## 3. Backend·시스템 연결 — 통합 지점과 선택지

architecture.md의 책임 경계가 이미 답의 골격: **ML은 점수만, backend가 판정·발송·영속화 전부 소유**.

### 3.1 데이터 흐름 (조사 결과를 기존 경로에 합성)

```
[camera/video] → windowing → POST /predict (ml/serving, FastAPI)
                                  │ fall_probability
                                  ▼
backend (NestJS): alert policy — threshold · dedup · rate-limit
                                  │ "alert 확정"
                                  ▼
   Prisma 트랜잭션: Alert row (+ outbox event) → PostgreSQL
                                  │
                                  ▼
   dispatch worker: 채널 어댑터 호출
        ├─ 경로 A: kauth.kakao.com 토큰 갱신 → kapi.kakao.com memo/friends send
        └─ 경로 B: 딜러사 API (알림톡, SMS failover 플래그)
                                  │
                                  ▼
   delivery 웹훅 수신 → notification_log 갱신 → (미전달 시) 에스컬레이션
```

### 3.2 "alert 확정 → 발송" 신뢰성 패턴 — 3가지 선택지

| 옵션 | 구성 | 보장 | 복잡도 |
|---|---|---|---|
| X. Direct enqueue | Prisma write 후 BullMQ(Redis) enqueue | 크래시 틈새에 유실 가능 | 낮음 |
| Y. Transactional outbox | Alert+OutboxEvent 동일 트랜잭션 → relay → BullMQ (`pg-transactional-outbox`, `@fullstackhouse/nestjs-outbox`) | at-least-once | 중간 |
| Z. Postgres-native queue | `pg-boss` / `graphile-worker` — Redis 불필요 | at-least-once | 낮음 (인프라 최소) |

공통 권장 요소 (출처: BullMQ docs, NHN Cloud API):
- **멱등성**: jobId = `alert:{guardianId}:{windowStart}` 해시; NHN Cloud는 멱등성 헤더 자체 지원.
  `Alert.dispatchedAt` 컬럼으로 이중 방어.
- **재시도**: 지수 백오프 (예: attempts 4, 3s→24s), 실패 시 DLQ.
- **rate-limit/dedup**: alert policy 단계에서 보호자별 N건/M분 (Redis INCR+EXPIRE 또는 BullMQ limiter).
- **에스컬레이션 체인**: 알림톡(or 카톡) → SMS → 음성전화(Twilio `nestjs-twilio` 등). 딜러사 failover
  플래그를 쓰면 1→2단계는 API 한 번으로 처리됨.
- **감사 로그**: `notification_log(alertId, channel, status, attempt, providerMessageId, ...)` —
  딜러사 웹훅을 ingest해 delivered/failed 기록.

### 3.3 Frontend(Next.js) 연결 — 경로 A 선택 시에만 필요

- 카카오 로그인으로 보호자 동의 수집: NextAuth `KakaoProvider`에 `scope: 'talk_message'` 추가,
  또는 가입 후 **추가 동의**(authorize?scope=talk_message) 플로우.
- 토큰 전달 패턴 2가지:
  - P1: 프론트(NextAuth)가 토큰 보관, API 호출마다 전달 — backend가 매번 검증 필요
  - P2: **backend가 OAuth callback을 직접 소유**해 code 교환·refresh token을 DB에 암호화 저장 —
    서버 발신에 필요한 토큰 수명 관리를 backend가 단독 책임 (조사 출처들은 P2를 권장 경향)
- 경로 B(알림톡) 선택 시 frontend는 **보호자 전화번호 수집 + 수신 동의(개인정보)만** 있으면 됨 —
  카카오 로그인 자체가 발송 전제조건이 아님.

### 3.4 Prisma 도메인 모델에 주는 시사점 (scaffold 단계 참고)

기존 주석 모델(`AnalysisJob`, `Prediction`, `Alert`)에 더해 조사상 필요해지는 것:
- `Guardian` (전화번호, 경로 A라면 암호화된 kakao refresh token + expiresAt)
- `NotificationLog` (채널, 상태, 시도 횟수, providerMessageId)
- 경로 Y 채택 시 `OutboxEvent`

## 4. 미확인/플래그 항목

1. Access token TTL 문서 불일치 (6h vs 12h) — 실측 필요.
2. 알림톡 야간 발송 제한(20:50–08:00)이 안전/보안 카테고리에도 적용되는지 — 딜러사/카카오 확인 필요.
   **야간 낙상이 핵심 시나리오이므로 결정 전 반드시 확인할 것.**
3. 메시지 API의 헬스케어 긴급 알림 예외 승인 가능성 — 공개 문서 근거 없음, Kakao 문의 필요.
4. Aligo ₩6.5/건이 표준 단가인지 선불 패키지가인지 — 미확인.
5. 케어 업계의 알림톡 낙상 알림 실사용 사례 — 공개 사례 미발견.
6. `solapi` v6 알림톡 호출 시그니처 — README/타입 기반 합성, examples 실코드 검증 전.

## 5. 결정으로 넘길 질문 (ADR 후보)

- **채널**: PoC는 경로 A-변형(나에게 보내기)으로 빠르게, 프로덕션은 경로 B(알림톡+SMS failover)로 —
  인가, 처음부터 B로 가는가? (사업자등록 가능 여부가 게이트)
- **딜러사**: SOLAPI(Node 지원 최선) vs NHN Cloud(멱등성/엔터프라이즈) vs 기타
- **신뢰성 패턴**: X(direct) / Y(outbox) / Z(pg-native queue)
- **토큰 소유**: P1(프론트) vs P2(backend OAuth callback 소유) — 경로 A 한정

## Sources

전 출처는 각 절 인라인 표기 외 핵심만 재수록:

- Kakao 메시지 API REST: https://developers.kakao.com/docs/en/kakaotalk-message/rest-api
- 메시지 API FAQ (알림은 비즈메시지로): https://developers.kakao.com/docs/en/kakaotalk-message/faq
- 쿼터: https://developers.kakao.com/docs/ko/getting-started/quota
- 카카오 로그인 REST (토큰): https://developers.kakao.com/docs/ko/kakaologin/rest-api
- 알림톡 가이드: https://kakaobusiness.gitbook.io/main/ad/infotalk · 심사: …/infotalk/audit
- 공식 딜러사 리스트: https://kakaobusiness.gitbook.io/main/partner/list
- 친구톡 종료/브랜드메시지: https://solapi.com/blog/kakaotalk-brand-message-notice
- SOLAPI 가격/Node SDK: https://solapi.com/pricing · https://github.com/solapi/solapi-nodejs
- NHN Cloud 알림톡 API: https://docs.nhncloud.com/en/Notification/KakaoTalk%20Bizmessage/en/alimtalk-api-guide/
- BullMQ NestJS/멱등성: https://docs.bullmq.io/guide/nestjs · https://docs.bullmq.io/patterns/idempotent-jobs
- Outbox: https://github.com/fullstackhouse/nestjs-outbox · https://www.npmjs.com/package/pg-transactional-outbox
- 응급안전안심서비스: https://www.mohw.go.kr/board.es?mid=a10503010100&bid=0027&act=view&list_no=1480948
