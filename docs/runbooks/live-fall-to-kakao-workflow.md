# 실시간 웹캠 낙상 → 카카오 알림 워크플로 (#226)

> **시나리오 (내일):** 원장이 **웹캠을 켜면** → 실시간으로 낙상을 잡아서 → **원장 본인 카카오톡**으로 한글 리치 알림을 보낸다.
>
> **상태:** 2026-06-18 **라이브 검증 완료** — 실제 OAuth 로그인 → 토큰 저장 → 실제 `AlertClient` 발사 → `/ingest` → fan-out → `delivery_attempts.status=SENT` → **원장 폰 도착 확인**. 우회 경로 없음.

---

## 1. 아키텍처 흐름 (검증된 경로)

현재 production live RTSP 경로는 `RTSP -> ml-worker -> backend /ingest/*`다.
FastAPI `ml-api`는 private/local health/status/models/debug/control API이며
production RTSP, raw frame relay, backend ingest side effects를 소유하지 않는다.
아래 Streamlit 경로는 2026-06-18 웹캠 데모 검증 기록이다.

```
[웹캠]
  └─ Streamlit 데모(ml/demo/app.py): YOLO pose → 낙상 분류 → FallEventLatch (정상→낙상 rising edge)
       └─ AlertClient.send(event_type="fall", detected_at, confidence)        (ml/events/publisher.py)
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
- `( cd backend && pnpm exec dotenv -e ../.env.local -- prisma migrate deploy )`
- 시드: `pnpm prisma:seed` → demo-org-01 + 거주자(홍길동/demo-res-01 …) + 카메라(`Cam 01 secret=… keyId=demo-cam-01-keyid`) 출력 → **secret 보관**(.env.edge.prod에 사용).

### 3.2 repo root .env.local
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

### 3.5 .env.edge.prod (데모 발송 자격)
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
pnpm dev:backend                 # :8080 (repo-root .env.local 자동 로드)
pnpm dev:front                   # :3000 (same-origin 로그인/대시보드)
# 데모는 .env.edge.prod를 환경에 로드해서 띄운다 (uv는 .env 자동 로드 안 함):
set -a; . .env.edge.prod; set +a
pnpm dev:demo                    # Streamlit :8501 — AlertClient.from_env가 위 env로 활성
```
> .env.edge.prod가 환경에 없으면 `AlertClient.from_env`가 `None`(alert-less) → 낙상 쳐도 발송 안 됨. 반드시 로드.
> Streamlit 첫 실행 이메일 프롬프트는 `~/.streamlit/credentials.toml`에 `[general]\nemail=""` 두면 스킵. 백그라운드는 `--server.headless=true`.

Production RTSP worker dev는 별도 터미널에서 실행한다:

```bash
pnpm dev:ml-api        # ml-api private/local FastAPI surface
pnpm dev:ml-worker --config config/ml-worker.local.yaml
```

Edge Compose는 native dev와 별개다:

```bash
EDGE_CAMERA_CONFIG=./ml/config/ml-worker.local.yaml \
  docker compose -f compose.edge.yaml up -d --build
```

`EDGE_CAMERA_CONFIG`는 per-camera RTSP URL과 backend /ingest key/secret을 담는 gitignored 파일이다. 개발 중 실 카메라 없이 worker를 계속 돌릴 때는 `pnpm dev:rtsp -- /path/to/video.mp4`로 `rtsp://127.0.0.1:8554/nursing-home`을 유지하고 worker config가 그 URL을 소비하게 한다. production-shaped E2E를 확인할 때는 같은 publisher를 재사용하는 `scripts/ml-worker-nursing-home-backend-e2e.sh`를 실행한다.

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
| 낙상 쳐도 alert_events 0건 | (a) .env.edge.prod 미로드(AlertClient alert-less) (b) HMAC 401: 서명키 = `sha256(secret)` 확인, detected_at 5분 freshness (c) 임계값 미발화 |
| 시드 RLS(42501) | 시드는 `DIRECT_URL`(롤 `fall`)로 도는데 `fall`에 BYPASSRLS 필요(§3.1) |

## 8. 관련 산출물

- 코드: `feat/226-register-developer-as-first-kakao-user-live-send-t`, PR #241.
- ADR: `docs/decisions/backend/ADR-051`(scope env/최소권한), `ADR-052`(메시지 DTO+한글 포맷), `ADR-053`(등록-유저 수신자 모델).
- 스펙/계획: `.gjc/specs/deep-interview-kakao-fall-alert-delivery.md`, `.gjc/plans/ralplan/2026-06-18-0708-af1a/`.
- 멀티-수신자 데모(나+형) 절차: `docs/runbooks/thursday-mvp-demo.md`.

## 9. 커맨드라인 전체 (복붙용 — 2026-06-18 실행 그대로)

> 경로: 작업 worktree 루트(`feat/226-…`)에서 실행. `<WT>` = worktree 루트, `<PGADMIN>` = `postgresql://<로컬슈퍼유저>@127.0.0.1:5432/postgres`.

```bash
# ── A. 의존성 ────────────────────────────────────────────────────────────────
pnpm install
( cd ml && uv sync )                              # ML(데모) 의존성 (uv)

# ── B. DB 기동 ───────────────────────────────────────────────────────────────
# B-1) 표준(Docker):
pnpm db:up                                        # docker compose up -d db (fall/fall/fall_dev)
# B-2) Docker 불가 → 로컬 Postgres에 직접 프로비저닝 (슈퍼유저로):
psql "<PGADMIN>" -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE fall      LOGIN PASSWORD '<DIRECT_URL_PASS>';
CREATE ROLE fall_app  LOGIN PASSWORD '<DATABASE_URL_PASS>';
CREATE DATABASE fall_dev OWNER fall;
GRANT ALL PRIVILEGES ON DATABASE fall_dev TO fall_app;
ALTER ROLE fall BYPASSRLS;          -- 시드/마이그레이션 전용. fall_app은 NOBYPASSRLS 유지!
SQL

# ── C. env 파일 ──────────────────────────────────────────────────────────────
cp .env.local.example .env.local                              # 그리고 §3.2 값 채우기 (실 카카오 키 + KAKAO_TOKEN_ENC_KEY)
grep -q '^KAKAO_TOKEN_ENC_KEY=' .env.local \
  || echo "KAKAO_TOKEN_ENC_KEY=$(openssl rand -hex 32)" >> .env.local
# .env.edge.prod (§3.5) — INGEST_SECRET/KEY_ID는 아래 seed 출력값 사용
cat > .env.edge.prod <<'ENV'
ALERT_API_URL=http://localhost:8080/ingest/alerts
INGEST_KEY_ID=demo-cam-01-keyid
INGEST_SECRET=<seed가 출력한 Cam 01 raw secret>
DEMO_RESIDENT_ID=demo-res-01
DEMO_FACILITY_ID=demo-org-01
ENV

# ── D. 마이그레이션 + 시드 ────────────────────────────────────────────────────
( cd backend && npx prisma generate )
( cd backend && npx dotenv -e ../.env.local -- prisma migrate deploy )
( cd backend && npx dotenv -e ../.env.local -- prisma migrate status )   # "up to date" 확인
pnpm prisma:seed                                   # demo-org-01/거주자/카메라 — "Cam 01 secret=… keyId=…" 출력 → .env.edge.prod에 반영
#   (시드가 42501 RLS로 막히면: psql "<PGADMIN>" -c "ALTER ROLE fall BYPASSRLS;" 후 재시드)

# ── E. 서비스 기동 ───────────────────────────────────────────────────────────
( cd backend && nohup pnpm start > /tmp/be.log 2>&1 & )    # :8080
nohup pnpm dev:front > /tmp/fe.log 2>&1 &                  # :3000
printf '[general]\nemail = ""\n' > ~/.streamlit/credentials.toml   # Streamlit 첫실행 프롬프트 스킵
set -a; . .env.edge.prod; set +a                                        # ★ uv는 .env 자동 로드 안 함 — 데모에 ingest 자격 주입
STREAMLIT_SERVER_HEADLESS=true \
  nohup uv run --directory ml --group demo streamlit run demo/app.py --server.headless=true --server.port=8501 > /tmp/demo.log 2>&1 &

# ── F. 원장 1회 로그인 + 수신자 등록 ─────────────────────────────────────────
#   브라우저(반드시 localhost): http://localhost:8080/auth/kakao/login  → 카카오 로그인 → talk_message 동의
#   로그인 후 kakaoId 확인:
psql "postgresql://<로컬슈퍼유저>@127.0.0.1:5432/fall_dev" -tAc \
  "SELECT kakao_id, token_scope FROM kakao_identities ORDER BY created_at DESC LIMIT 1;"
pnpm --filter backend demo:bind <원장_kakaoId>             # demo-org-01 수신자로 바인딩

# ── G. 실시간 시연 ───────────────────────────────────────────────────────────
#   http://localhost:8501 → 웹캠 소스 선택 → 추론 시작 → 낙상 → 자동 발사 → 카톡 도착
#   (검증은 §6 / §10 SQL)
```

> **(테스트 전용, 웹캠 없이) 실제 클라이언트로 낙상 1건 발사** — 우회 아님(데모가 쓰는 `AlertClient` 그대로):
> ```bash
> set -a; . .env.edge.prod; set +a
> uv run --directory ml python - <<'PY'
> import datetime as dt
> from events import AlertClient
> c = AlertClient.from_env(source_id="demo-cam-01"); assert c
> c.send(event_type="fall",
>        detected_at=dt.datetime.now(dt.UTC).isoformat(timespec="seconds").replace("+00:00","Z"),
>        confidence=0.95)
> c.close()   # flush + 워커 join → POST 완료 보장
> print("failures:", c.failure_count, "drops:", c.drop_count)   # @property — () 없이
> PY
> ```

## 10. DB 적재 — 낙상 알림은 어디에 쌓이나

낙상 알림 **1건이 들어오면 다음 4개 테이블에 적재**된다(2026-06-18 라이브 확인):

| 테이블 | 역할 | 적재 내용(예: 위 라이브 1건) |
|---|---|---|
| `alerts` | 테넌트 낙상 **이력/감사** 레코드(append) | `alert_seq=1, resident_id=demo-res-01, camera_id=demo-cam-01, type=fall, probability=0.95, status=NEW, detected_at` |
| `resident_statuses` | 거주자 **현재 상태** read model(upsert) | `demo-res-01 → state=FALL, camera_online=t, source_id=demo-cam-01, last_seen_at` (prob≥0.8 → FALL) |
| `alert_events` | 백엔드 outbox 이벤트 | `type=FALL, source_id=demo-cam-01, confidence=0.95, decision=DISPATCH` |
| `delivery_attempts` | **수신자별 발송 로그** | `recipient_user_id=<원장>, channel=KAKAO_SEND_TO_ME, status=SENT, provider_reference=kakao-send-to-me, sent_at` |

- 멱등성(idempotencyKey=hash(cameraId|detectedAt|type)) → 같은 낙상 중복 ingest해도 `alerts`/`alert_events`는 1건. `delivery_attempts`는 수신자 unique 키로 중복 방지 + no-double-send(이미 SENT면 재발송 안 함).
- `alerts.status`는 운영자가 대시보드에서 `NEW → ACKNOWLEDGED` 등으로 처리(ack API). 알림 이력은 `alerts`에 누적 보존된다.

```sql
-- 낙상 알림 이력(누적) 조회
SELECT alert_seq, resident_id, camera_id, type, probability, status, detected_at
  FROM alerts ORDER BY alert_seq DESC LIMIT 20;
-- 거주자 현재 상태
SELECT resident_id, state, camera_online, last_seen_at FROM resident_statuses WHERE org_id='demo-org-01';
-- 발송 결과(누가/언제/성공여부)
SELECT a.detected_at, da.recipient_user_id, da.status, da.provider_reference, da.failure_class, da.last_error
  FROM delivery_attempts da
  JOIN alert_events ae ON ae.id = da.alert_event_id
  ORDER BY da.created_at DESC LIMIT 20;
-- API로도 조회: GET http://localhost:8080/api/alerts  (세션 쿠키 필요)
```
