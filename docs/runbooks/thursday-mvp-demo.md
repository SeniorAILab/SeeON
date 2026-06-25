# 목요일 MVP 데모 리허설 런북 (issue #211)

라이브 낙상 → 카카오 멀티유저 fan-out 알림 + 카카오 로그인/가입 + 실시간 대시보드 end-to-end 시연 절차.
관련: 합의 계획 `.gjc/plans/ralplan/019ed409-…/pending-approval.md`, 스펙 `.gjc/specs/deep-interview-thursday-mvp-…md`.

> 환경 변수 위치 규칙: repo root `.env.local` 하나가 네이티브 backend, Vite frontend, Prisma, local Compose의 SSOT다. `backend/.env*`/`front/.env*`/`ml/.env*`는 만들지 않는다.

## 0. 외부 선행조건 (Phase 0 — 코드 아님, 사용자 수동)
> 이게 안 되면 카카오 로그인도 알림도 동작하지 않는다. 데모 전날까지 완료할 것.

- 카카오 Developers 앱: 카카오 로그인 활성화, 동의항목 `talk_message` + `profile_nickname`; **나 + 형 둘 다 앱 '팀원'(테스트 사용자) 등록**(개발 단계에선 등록 사용자만 `talk_message` 동의 가능); Redirect URI `http://localhost:8080/auth/kakao/callback`.
- repo root `.env.local` (`.env.local.example` 복사 후 실값):
  - `KAKAO_REST_API_KEY=<실키>`, (선택) `KAKAO_CLIENT_SECRET`
  - `KAKAO_REDIRECT_URI=http://localhost:8080/auth/kakao/callback`
  - `KAKAO_TOKEN_ENC_KEY=<openssl rand -hex 32>` (per-user 토큰 암호화 키 — 더미 금지)
  - `FRONT_ORIGIN=http://localhost:3000`, `SESSION_JWT_SECRET=<32자+>`
  - `DATABASE_URL`/`DIRECT_URL` (기본 로컬값)

## 1. 스택 기동
```bash
pnpm install
cd ml && uv sync && cd ..
cp .env.local.example .env.local   # 위 0번 실값 채우기
pnpm db:up
pnpm prisma:generate
pnpm prisma:migrate     # root .env.local 로드해 Phase1/3 마이그레이션 적용(migrate dev)
pnpm prisma:seed        # demo-org-01 + 카메라(HMAC keyId/secret 콘솔 출력) + 거주자 시드
pnpm dev:backend        # :8080
pnpm dev:front          # :3000
pnpm dev:demo           # Streamlit 데모 (노트북 카메라 + 내부 클립 소스, 모드 분기 없음)
```
> `pnpm prisma:seed`가 출력하는 `Cam 01: secret=… keyId=…`를 저장 — 3번 ml alert 자격에 넣는다.
> `dev:demo`는 이제 모드 분기가 없다(ADR-045 — 데모는 로컬 전용). 노트북 카메라와 모든 내부 클립 소스가 항상 노출된다.

Production live RTSP path는 데모와 분리되어 있다:

```text
RTSP -> ml-worker -> ml-api -> backend /ingest/*
```

Native dev에서는 `pnpm dev:ml-api`이 `ml-api` private/local FastAPI surface를 띄우고,
`pnpm dev:ml-worker --config config/ml-worker.local.yaml`이 RTSP worker를 띄운다. 이 script는 `ml/` 안에서 실행되므로 config path도 `ml/` 기준이다.
Edge Compose는 다음처럼 별도로 검증한다:

```bash
EDGE_CAMERA_CONFIG=./ml/config/ml-worker.local.yaml \
  docker compose -f compose.edge.yaml up -d --build
```

`EDGE_CAMERA_CONFIG`는 per-camera RTSP URL과 domain/model 설정을 담는 gitignored 파일이다. backend `/ingest/*` key/secret은 ADR-067/029에 따라 `ml-api` secret 설정에 둔다. 개발 중 실 카메라 없이 worker를 계속 돌릴 때는 `pnpm dev:rtsp -- /path/to/video.mp4`로 `rtsp://127.0.0.1:8554/nursing-home`을 유지하고 worker config가 그 URL을 소비하게 한다. production-shaped E2E를 확인할 때는 같은 publisher를 재사용하는 `scripts/ml-worker-nursing-home-backend-e2e.sh`를 사용한다. Jetson Nano는 legacy/constrained hardware-gated target이므로, 실제 장비 smoke 없이는 지원 완료로 말하지 않는다.

## 2. 데모 테넌트 바인딩 (나·형을 demo-org-01에 묶기)
1. 나 + 형이 각각 `http://localhost:3000/login` → 카카오 로그인(동의 시 `talk_message` 포함) 1회 → User + 암호화 토큰 생성.
2. 두 사람의 kakaoId 확인 후:
   ```bash
   DEMO_KAKAO_IDS=<my_kakaoId>,<hyung_kakaoId> pnpm demo:bind
   ```
   → `demo:bind`는 root `.env.local`(DIRECT_URL)를 로드해 두 User.orgId + KakaoIdentity.orgId = demo-org-01로 설정. (온보딩 새 org 생성에 의존하지 않음)

## 3. `.env.edge.prod` (데모 alert 발송 자격)
```
ALERT_API_URL=http://localhost:8080/ingest/alerts
INGEST_KEY_ID=<시드 출력 keyId, 예 demo-cam-01-keyid>
INGEST_SECRET=<시드 출력 raw secret>
DEMO_RESIDENT_ID=demo-res-01
DEMO_FACILITY_ID=demo-org-01
```
> 데모 클라이언트는 서명키로 `sha256(INGEST_SECRET)`를 사용(백엔드 `ingestSecretHash`와 일치). canonical = `resident|facility|type|detected_at`.

## 4. 추론 임계값 (operating threshold)
- 분류기 임계값은 `training/config.py`(`T_WINDOW=30`, `STRIDE=5`, `OVERLAP_THRESHOLD=0.5`)와 `evaluate`가 각 모델 `metadata.json`에 기록한 Recall≥0.90 operating point에 따른다(Le2i clip-wise F1 ≈ 0.6–0.85가 정상).
- 라이브 데모에선 Streamlit UI decision threshold 슬라이더로 미세조정. **사전 캘리브레이션**에서 실제 낙상 모션이 반복 발화하는 값으로 맞춘 뒤 고정/기록.

## 5. E2E 시연 시퀀스
1. 나: `http://localhost:3000/login` → 카카오 로그인 → (org 있으면) 대시보드 진입.
2. Streamlit operator mode → 소스 = **노트북 카메라(index 0)** 선택 → 라이브 추론 시작.
3. 카메라 앞에서 낙상 모션 → 분류기 발화 → alert_client가 `/ingest/alerts`(HMAC) POST.
4. 백엔드: `Alert`+SSE 생성 + `AlertEvent`+per-recipient `DeliveryAttempt` fan-out → 나·형 카카오톡 send-to-me 2건 도착.
5. Next 대시보드 실시간 알림 피드에 동일 alert 표시(SSE) + 거주자 상태 갱신.

## 6. 실패 모드 / 사전 점검
- 형 카톡 미수신: 형 팀원 등록·`talk_message` 동의·토큰 신선도(시연 직전 재로그인) 확인. per-recipient 격리라 한 명 실패가 다른 발송을 막지 않음.
- 낙상 미발화: 임계값 재조정 + 모션 리허설. 백업 녹화 클립은 **debug 폴백**으로만(라이브 수용기준 대체 금지).
- HMAC 401(InvalidSignature): 서명키가 raw secret이 아니라 `sha256(secret)`인지 확인.
- 로그인 후 8080/dashboard 404: 백엔드 콜백이 `${FRONT_ORIGIN}` 절대 redirect인지 확인(Phase2 적용됨).
- 대시보드 피드 비어있음: 로그인 유저 org == 카메라 org(demo-org-01) 바인딩(2단계) 확인.
- 카메라 소스 안 보임: 카메라 장치 연결/권한 확인. 데모는 항상 카메라 소스를 노출한다(모드 분기 없음).

## 7. 미검증(라이브 의존) — 정직 고지
- 실제 카카오 발송, 실제 노트북 카메라 라이브 캡처, 브라우저 로그인→대시보드 E2E는 Phase 0(실 콘솔/키) + 카메라 하드웨어가 있어야 검증된다. 코드/통합 경로는 단위·서비스 테스트로 검증됨(G001–G005). 이 런북대로 리허설에서 최종 확인할 것.

## 8. #226 업데이트 — Kakao scope env화 + 한글 리치 메시지

이 브랜치(`feat/226`)가 위 절차에 더하는 델타. 관련: ADR-051(scope), ADR-052(메시지 DTO/포맷), ADR-053(수신자 모델).

- **콘솔 동의항목 부담 감소**: scope 기본값이 이제 `talk_message`만이다(`KakaoClient.resolveScopes`). **`profile_nickname` 동의항목은 더 이상 필수가 아니다** — 닉네임이 필요해 일부러 켤 때만 `KAKAO_SCOPES="talk_message profile_nickname"`로 opt-in. profile_nickname 미동의로 인한 `invalid_scope`가 사라진다. (닉네임 미수집 시 `Kakao User`로 폴백.)
- **env 추가**(root `.env.local`):
  - `# KAKAO_SCOPES=talk_message` (생략 시 기본 talk_message)
  - `ALERT_DASHBOARD_URL=http://localhost:3000` — 카카오 메시지의 대시보드 링크. **카카오 앱 Web 플랫폼에 이 도메인을 등록**해야 text 템플릿 link가 렌더된다(로컬은 등록 도메인/터널 필요). 미등록 시 발송 4xx 또는 링크 미작동.
  - (선택) `KAKAO_MESSAGE_LINK_URL`(링크 우선순위 > ALERT_DASHBOARD_URL), `KAKAO_MESSAGE_ENDPOINT`.
- **메시지 포맷 변경(5번 시퀀스 4단계 확인 포인트)**: 도착하는 카톡이 이제 디버그 문자열이 아니라 한글 리치 text다 — `🚨 낙상 감지 / 👤 {거주자명}님 · 🏠 {호실} / 🕐 {KST} / 📊 확신도 {n}% / 👉 대시보드에서 상태 확인`. 거주자명·호실은 백엔드 DB(alert-writer resident join)에서 채워지고(ml 무변경), 디버그/DB ID는 노출되지 않으며 ≤180자.
- **사전 점검 추가**: 카톡은 도착하나 링크가 안 열림 → `ALERT_DASHBOARD_URL` 도메인이 카카오 콘솔 Web 플랫폼에 등록됐는지 먼저 확인.

> 코드/테스트: G001(scope env+tokenScope), G002(메시지 DTO+어댑터+거주자 seam), G003(fan-out·수신자정책·decrypt-no-send·중복/재시도 no-double-send)은 단위·서비스 테스트로 검증됨. 실제 폰 도착(AC11)은 Phase 0(실 콘솔/키/도메인 등록) + 1회 OAuth 동의 후 이 런북대로 라이브 확인.
