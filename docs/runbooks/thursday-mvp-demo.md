# 목요일 MVP 데모 리허설 런북 (issue #211)

라이브 낙상 → 카카오 멀티유저 fan-out 알림 + 카카오 로그인/가입 + 실시간 대시보드 end-to-end 시연 절차.
관련: 합의 계획 `.gjc/plans/ralplan/019ed409-…/pending-approval.md`, 스펙 `.gjc/specs/deep-interview-thursday-mvp-…md`.

> 환경 변수 위치 규칙: **네이티브 dev(`pnpm dev:*`)는 `backend/.env.development`를 읽는다.** 루트 `.env`는 Docker Compose `${VAR}` 인터폴레이션 전용이다. 네이티브 시연에선 카카오/세션/토큰 키를 `backend/.env.development`에 둔다.

## 0. 외부 선행조건 (Phase 0 — 코드 아님, 사용자 수동)
> 이게 안 되면 카카오 로그인도 알림도 동작하지 않는다. 데모 전날까지 완료할 것.

- 카카오 Developers 앱: 카카오 로그인 활성화, 동의항목 `talk_message` + `profile_nickname`; **나 + 형 둘 다 앱 '팀원'(테스트 사용자) 등록**(개발 단계에선 등록 사용자만 `talk_message` 동의 가능); Redirect URI `http://localhost:8080/auth/kakao/callback`.
- `backend/.env.development` (템플릿 `backend/.env.example` 복사 후 실값):
  - `KAKAO_REST_API_KEY=<실키>`, (선택) `KAKAO_CLIENT_SECRET`
  - `KAKAO_REDIRECT_URI=http://localhost:8080/auth/kakao/callback`
  - `KAKAO_TOKEN_ENC_KEY=<openssl rand -hex 32>` (per-user 토큰 암호화 키 — 더미 금지)
  - `FRONT_ORIGIN=http://localhost:3000`, `SESSION_JWT_SECRET=<32자+>`
  - `DATABASE_URL`/`DIRECT_URL` (기본 로컬값)

## 1. 스택 기동
```bash
pnpm install
cd ml && uv sync && cd ..
cp backend/.env.example backend/.env.development   # 위 0번 실값 채우기
pnpm db:up
pnpm prisma:generate
pnpm prisma:migrate     # backend/.env.development 로드해 Phase1/3 마이그레이션 적용(migrate dev)
pnpm prisma:seed        # demo-org-01 + 카메라(HMAC keyId/secret 콘솔 출력) + 거주자 시드
pnpm dev:backend        # :8080
pnpm dev:front          # :3000
pnpm dev:demo           # Streamlit 데모 (노트북 카메라 + 내부 클립 소스, 모드 분기 없음)
```
> `pnpm prisma:seed`가 출력하는 `Cam 01: secret=… keyId=…`를 저장 — 3번 ml alert 자격에 넣는다.
> `dev:demo`는 이제 모드 분기가 없다(ADR-045 — 데모는 로컬 전용). 노트북 카메라와 모든 내부 클립 소스가 항상 노출된다.

## 2. 데모 테넌트 바인딩 (나·형을 demo-org-01에 묶기)
1. 나 + 형이 각각 `http://localhost:3000/login` → 카카오 로그인(동의 시 `talk_message` 포함) 1회 → User + 암호화 토큰 생성.
2. 두 사람의 kakaoId 확인 후:
   ```bash
   DEMO_KAKAO_IDS=<my_kakaoId>,<hyung_kakaoId> pnpm demo:bind
   ```
   → `demo:bind`는 `backend/.env.development`(DIRECT_URL)를 로드해 두 User.orgId + KakaoIdentity.orgId = demo-org-01로 설정. (온보딩 새 org 생성에 의존하지 않음)

## 3. ml/.env (데모 alert 발송 자격)
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
