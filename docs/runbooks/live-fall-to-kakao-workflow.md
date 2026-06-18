# 실시간 웹캠 낙상 → 카카오 알림 워크플로 (#226)

> **시나리오 (내일):** 원장이 **웹캠을 켜면** → 실시간으로 낙상을 잡아서 → **원장 본인 카카오톡**으로 한글 리치 알림을 보낸다.
>
> **상태:** 2026-06-18 **라이브 검증 완료** — 실제 OAuth 로그인 → 토큰 저장 → 실제 `AlertClient` 발사 → `/ingest` → fan-out → `delivery_attempts.status=SENT` → **원장 폰 도착 확인**. 우회 경로 없음.

---

## 1. 아키텍처 흐름 (검증된 경로)

```
[웹캠]
  └─ Streamlit 데모(ml/demo/app.py): YOLO pose → 낙상 분류 → FallEventLatch (정상→낙상 rising edge)
       └─ AlertClient.send(event_type="fall", detected_at, confidence)        (ml/core/alert_client.py)
            └─ HMAC POST /ingest/alerts                                        (X-Ingest-Key-Id / X-Signature / X-Ingest-Timestamp)
                 canonical = resident_id|facility_id|type|detected_at
                 signing  = HMAC-SHA256(key=sha256(secret), canonical)
                 └─ HmacIngestGuard 검증(get_camera_for_ingest, SECURITY DEFINER)  (backend/src/ingest/hmac.guard.ts)
                      └─ IngestAlertService.ingestAlert                         (backend/src/ingest/ingest-alert.service.ts)
                           ├─ AlertWriterService.writeAlert → Alert + resident{name,room} join + SSE   (alert-writer.service.ts)
                           └─ AlertEventsService.ensureOutboxForIngest          (alert-events.service.ts)
                                ├─ findKakaoRecipients(orgId)  ← 등록-유저(Kakao 토큰 보유) fan-out
                                └─ per-recipient DeliveryAttempt(recipientUserId)
                                     └─ dispatchRecipient → KakaoSendToMeChannelAdapter.send  (kakao-send-to-me-channel.adapter.ts)
                                          └─ KakaoAlertMessageDto → 한글 리치 text  (dto/kakao-alert-message.dto.ts)
                                               └─ POST kapi.kakao.com/v2/api/talk/memo/default/send (per-user access token)
                                                    └─ [원장 카카오톡 "나에게 보내기"]
```

**무우회 원칙 (불변):**
- 런타임 앱 DB 롤 `fall_app`은 **NOBYPASSRLS** — RLS 테넌트 격리 유지. BYPASSRLS는 시드/마이그레이션 전용 롤(`fall`)에만(`seed.ts` 설계).
- 발송은 **등록-유저 fan-out 경로**로만. REST 키 직발송·하드코딩 수신자·전화번호 라우팅 같은 우회 없음.
- send-to-me는 **OAuth 토큰을 인가한 그 계정에만** 도달 → 원장이 1회 동의해야 함(앱 키로 대체 불가).
- 멱등성(idempotencyKey = hash(cameraId|detectedAt|type)) + no-double-send 가드(PENDING 시도만 발송; SENT/RETRY_SCHEDULED/TERMINAL_FAILED 스킵).

## 2. 메시지 포맷 (도착 예시)

```
🚨 낙상 감지
👤 홍길동님 · 🏠 101호
🕐 2026-06-18 19:04 KST
📊 확신도 95%
👉 대시보드에서 상태 확인
```
- 거주자명/호실 = 백엔드 DB(resident join), 확신도 = ingest probability → 퍼센트. 디버그/DB ID 비노출, ≤180자.
- scope 기본 `talk_message`만(profile_nickname 안 받음 → invalid_scope 없음; 닉네임은 `Kakao User` 폴백).

## 3. 1회 셋업 (최초 1번 — 이미 완료, 재현용 기록)

### 3.1 DB
- 표준: `pnpm db:up` (docker compose, postgres17, user=fall/pass=fall/db=fall_dev).
- Docker 불가 시(로컬 Postgres 사용): 슈퍼유저로 롤/DB 생성 후 마이그레이션.
  ```sql
  CREATE ROLE fall      LOGIN PASSWORD '<DIRECT_URL pass>';   -- 시드/마이그레이션 (BYPASSRLS)
  CREATE ROLE fall_app  LOGIN PASSWORD '<DATABASE_URL pass>'; -- 런타임 (NOBYPASSRLS)
  CREATE DATABASE fall_dev OWNER fall;
  GRANT ALL PRIVILEGES ON DATABASE fall_dev TO fall_app;
  ALTER ROLE fall BYPASSRLS;   -- seed.ts가 DIRECT_URL로 RLS 우회 시드 (런타임 fall_app은 그대로 NOBYPASSRLS)
  ```
- `pnpm --filter backend exec -- dotenv -e .env.development -- prisma migrate deploy`
- 시드: `pnpm prisma:seed` → demo-org-01 + 거주자(홍길동/demo-res-01 …) + 카메라(`Cam 01 secret=… keyId=demo-cam-01-keyid`) 출력 → **secret 보관**(ml/.env에 사용).

### 3.2 backend/.env.development
```
DATABASE_URL=postgresql://fall_app:****@localhost:5432/fall_dev?schema=public
DIRECT_URL=postgresql://fall:****@localhost:5432/fall_dev
FRONT_ORIGIN=http://localhost:3000
KAKAO_REST_API_KEY=<실 REST 키>
# KAKAO_CLIENT_SECRET=<있으면>
KAKAO_REDIRECT_URI=http://localhost:8080/auth/kakao/callback
KAKAO_TOKEN_ENC_KEY=<openssl rand -hex 32>   # per-user 토큰 암호화(필수)
# KAKAO_SCOPES=talk_message                    # 기본값이 talk_message — 보통 생략
ALERT_DASHBOARD_URL=http://localhost:3000      # 메시지 링크 — 카카오 콘솔 Web 플랫폼에 도메인 등록 필요
SESSION_JWT_SECRET=<32자+>
```

### 3.3 카카오 개발자 콘솔 (원장 계정)
- 카카오 로그인 활성화, 동의항목 **talk_message**, Redirect URI `http://localhost:8080/auth/kakao/callback`.
- **Web 플랫폼 도메인에 `ALERT_DASHBOARD_URL` 도메인 등록**(로컬은 등록 도메인/터널) — 메시지 link 렌더에 필요.

### 3.4 원장 OAuth 로그인 + 수신자 등록 (1회)
1. 브라우저에서 **`http://localhost:8080/auth/kakao/login`** (반드시 `localhost`) → 카카오 로그인 → talk_message 동의 → 콜백이 암호화 토큰 저장.
2. 원장 kakaoId 확인 후: `pnpm --filter backend demo:bind <kakaoId>` → 원장을 demo-org-01 수신자로 바인딩.
   - 검증: `users.org_id = kakao_identities.org_id = demo-org-01`, `kakao_identities.access_token_cipher`가 `v1:…`(암호화), `token_scope=talk_message`.

### 3.5 ml/.env (데모 발송 자격)
```
ALERT_API_URL=http://localhost:8080/ingest/alerts
INGEST_KEY_ID=demo-cam-01-keyid          # seed가 만든 Cam 01 keyId
INGEST_SECRET=<seed 출력 Cam 01 raw secret>   # 클라가 sha256(secret)로 서명 = 백엔드 ingestSecretHash
DEMO_RESIDENT_ID=demo-res-01
DEMO_FACILITY_ID=demo-org-01
```

## 4. 매일 기동

```bash
pnpm db:up                       # DB
pnpm dev:backend                 # :8080 (backend/.env.development 자동 로드)
pnpm dev:front                   # :3000 (same-origin 로그인/대시보드)
# 데모는 ml/.env를 환경에 로드해서 띄운다 (uv는 .env 자동 로드 안 함):
set -a; . ml/.env; set +a
pnpm dev:demo                    # Streamlit :8501 — AlertClient.from_env가 위 env로 활성
```
> ml/.env가 환경에 없으면 `AlertClient.from_env`가 `None`(alert-less) → 낙상 쳐도 발송 안 됨. 반드시 로드.
> Streamlit 첫 실행 이메일 프롬프트는 `~/.streamlit/credentials.toml`에 `[general]\nemail=""` 두면 스킵. 백그라운드는 `--server.headless=true`.

## 5. 내일 시나리오 — 실시간 웹캠 → 카톡

1. (1회 셋업 + 매일 기동 완료 상태) 원장이 **http://localhost:8501** 열기.
2. 소스 = **웹캠(노트북 카메라)** 선택 → 라이브 추론 시작.
3. 카메라 앞에서 낙상 → 분류기 발화 → `FallEventLatch` rising edge → `AlertClient.send(event_type="fall", …)` 자동 발사.
   - 발화가 약하면 UI decision threshold 슬라이더를 실제 모션이 터지는 값으로 보정(사전 캘리브레이션 후 고정).
4. 수 초 내 원장 카톡 "나에게 보내기"에 한글 리치 알림 도착. 대시보드(:3000)에도 SSE 실시간 표시.

## 6. 검증 포인트

```sql
-- 발사 후
SELECT type, source_id, confidence, decision, created_at FROM alert_events ORDER BY created_at DESC LIMIT 1;
SELECT recipient_user_id, status, provider_reference, failure_class, last_error, sent_at
  FROM delivery_attempts ORDER BY created_at DESC LIMIT 1;   -- status=SENT, provider_reference=kakao-send-to-me 면 폰 발송 성공
```
- 2026-06-18 라이브: `alert_events` FALL 1건, `delivery_attempts` **SENT**(provider_reference=kakao-send-to-me), 원장 폰 도착 확인.

## 7. 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| 로그인 invalid_scope | 거의 없음(scope=talk_message). 콘솔 talk_message 동의항목/테스트 사용자 등록 확인 |
| 콜백 후 "Invalid OAuth state" | `127.0.0.1`로 들어옴 → **`localhost`로** (oauth_state 쿠키 호스트 일치) |
| 카톡 안 옴, alert_events는 생김 | 토큰 만료/복호 실패 → `delivery_attempts.terminal_reason` 확인 → 원장 재로그인. per-recipient 격리라 한 명 실패가 다른 발송 안 막음 |
| 카톡 오나 링크 안 열림 | `ALERT_DASHBOARD_URL` 도메인이 카카오 콘솔 Web 플랫폼에 등록됐는지 |
| 낙상 쳐도 alert_events 0건 | (a) ml/.env 미로드(AlertClient alert-less) (b) HMAC 401: 서명키 = `sha256(secret)` 확인, detected_at 5분 freshness (c) 임계값 미발화 |
| 시드 RLS(42501) | 시드는 `DIRECT_URL`(롤 `fall`)로 도는데 `fall`에 BYPASSRLS 필요(§3.1) |

## 8. 관련 산출물

- 코드: `feat/226-register-developer-as-first-kakao-user-live-send-t`, PR #241.
- ADR: `docs/decisions/backend/ADR-051`(scope env/최소권한), `ADR-052`(메시지 DTO+한글 포맷), `ADR-053`(등록-유저 수신자 모델).
- 스펙/계획: `.gjc/specs/deep-interview-kakao-fall-alert-delivery.md`, `.gjc/plans/ralplan/2026-06-18-0708-af1a/`.
- 멀티-수신자 데모(나+형) 절차: `docs/runbooks/thursday-mvp-demo.md`.
