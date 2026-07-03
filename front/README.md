# Senior AI Lab · 케어 모니터링 대시보드

요양원 CCTV 영상을 **직접 노출하지 않고**, AI가 분석한 결과만 방·공간 단위 카드 UI로 보여주는 안전 모니터링 대시보드입니다. "감시"가 아닌 "안전 확인" 톤으로 설계되었습니다.

기준 시설: **행복한요양원 녹양역점** · 멀티테넌트(여러 시설) 확장 구조.

---

## 빠른 시작

```bash
pnpm install        # repo root에서 실행
pnpm --filter front dev      # http://localhost:3000
pnpm --filter front build    # 타입체크 + 프로덕션 빌드
pnpm --filter front preview  # 빌드 결과 미리보기
```

### 로그인

dev/prod 로그인은 백엔드가 소유합니다. 이메일/비밀번호는 `POST /api/v1/auth/login`,
Kakao OAuth는 `/api/v1/auth/kakao/login`으로 시작하며, 두 경로 모두 백엔드가 같은
httpOnly `app_session` JWT 쿠키를 만든 뒤 프론트가 `GET /api/v1/auth/me`로 복원합니다. 처음
로그인한 계정이 아직 시설에 연결되지 않았다면 `/onboarding`에서
`POST /api/v1/facilities`로 시설을 등록합니다.

로컬 seed 계정은 `super@sen.ai`, `admin@sen.ai`, `staff@sen.ai`이며 비밀번호는
`NOKYANG_ADMIN_PASSWORD` 등 backend seed 환경변수에서 옵니다. 운영 seed에는 조용한 기본 비밀번호가 없습니다.

---

## 사용자 모드 분리 (현장 직원 우선 UX)

실제 주 사용자는 60대 이상 요양보호사·간호조무사·사회복지사·야간 근무자입니다. 그래서 "멋진 대시보드"가 아니라 **3초 안에 위험을 이해하고 바로 행동하는 안전 확인 도구**로 설계했습니다.

### 직원 모드 (`/dashboard`, `/dashboard/floor/:floorId`, `/dashboard/alerts`) — 메뉴 3개만

- **지금 확인할 곳**: 로그인 후 첫 화면. 전체 대시보드가 아니라 위험/주의/확인필요 공간만, 위험 우선으로 큰 카드로 보여줍니다. 모두 안정이면 "지금은 모든 곳이 안정적입니다" 안내.
- **전체 방 상태**: 큰 층 탭 + 큰 카드.
- **확인한 알림**: 처리 완료된 알림 이력.
- **큰 글자·큰 버튼**: 공간명 28px, 상태 24px, 설명 19px, 버튼 21px·높이 56px+ (장갑 착용 대응). 색상 + 한글 문구 + 아이콘을 함께 사용(색약 대응).
- **조치 버튼 3개만**: 확인 완료 / 직원 방문 중 / 도움 요청. 추가 메모는 접어둠.
- **현장 문구만**: AI·confidence·detection·camera ID 같은 용어를 직원 화면에서 제거. "침대 주변 움직임이 많습니다" 식 한글 안내(`lib/staffCopy.ts`).
- **다크모드**: 야간(19~07시) 자동 다크 + 토글. 토큰(CSS 변수) 기반이라 모든 화면이 함께 전환됩니다.
- **소리·진동**: 새 위험 발생 시에만 부드러운 알림음 + 진동(토글 가능, `lib/alert.ts`).

### 관리자 모드 (`/admin/*`) — 설정·상세 데이터

상세 대시보드, 이벤트, 시설/층/공간/구역/카메라/보호자/입소자 관리 화면이 여기 모여 있습니다. 라우트는 프론트 화면 경로이며, 백엔드 API 계약은 `docs/api/route-inventory.md`에 있는 실제 컨트롤러 경로만 사용합니다. 관리자 화면은 항상 라이트 모드.

---

## 이슈 근거 영상 (관리자 전용) · 보안 우선

이 기능은 **"실시간 CCTV 관제"가 아니라 "AI 위험 감지 근거 영상 확인"**입니다. AI가 위험으로 감지한 **이벤트 구간(감지 10초 전 ~ 10초 후, 약 20초)** 클립만 관리자에게 제공합니다.

- **권한 분리**: STAFF는 영상 영역 자체가 없고 "영상은 관리자만 확인할 수 있습니다" 안내만 표시. ADMIN/SUPER_ADMIN만 이벤트 상세(`/admin/events/:eventId`)에서 근거 UI를 볼 수 있습니다.
- **현재 백엔드 계약**: 영상 presign/access-log 전용 API는 아직 없습니다. 스냅샷은 실제 컨트롤러가 제공하는 `GET /api/v1/alerts/:alertId/snapshot` 및 `PUT /api/v1/alerts/:alertId/snapshot`만 문서화된 계약입니다.
- **프론트 보안 경계**: 프론트 라우트 가드는 UX 목적입니다. 최종 권한은 백엔드의 `JwtAuthGuard`, `RequireFacilityGuard`, `RolesGuard`, capability RBAC가 강제합니다.

---

## 기술 스택

React 18 · TypeScript(strict) · Vite · Tailwind CSS · Zustand · React Router · Recharts · Lucide Icons. shadcn 톤의 경량 UI 프리미티브를 직접 구현해 외부 CLI 의존성을 없앴습니다.

---

## 폴더 구조

```
src/
├── types/index.ts          프론트 UI/domain 타입
├── data/mockData.ts        가역 숨김 페이지 전용 비활 fixture(실제 런타임 미사용)
├── lib/                    utils · labels(도메인 라벨) · roles(역할 호칭/권한/라우팅) · format(시간)
├── services/               API/서비스 레이어
│   ├── apiClient.ts        fetch 래퍼 (`/api/v1`, cookie credentials, X-Facility-Id)
│   ├── api/                실제 백엔드 endpoint mapper
│   ├── authService.ts      로그인/세션 복원
│   ├── dashboardService.ts 대시보드/공간 상태
│   ├── eventService.ts     이벤트 확인/조치
│   └── adminService.ts     가역 숨김 관리자 페이지 전용 비활 fixture
├── store/                  authStore(권한) · facilityStore(시설 선택)
├── components/             StatusCard, RiskBadge, StatusBadge, EventTimeline,
│                           AIInsightBox, KakaoAlertStatusBadge, ActionLogForm,
│                           FloorTabs, StatsBar, SpaceDetailPanel, layout/AppLayout ...
└── pages/                  LoginPage, DashboardPage, EventsPage,
                            admin/{Facility,Spaces,MonitorSettings,Users,EventDetail}Page
```

---

## 데이터 모델

프론트 타입은 `src/types/index.ts`의 UI/domain view입니다. 실제 백엔드 영속 모델과 API 표면은 Prisma schema 및 `backend/src/**/*.controller.ts`가 소유하고, 현재 route SSOT는 `docs/api/route-inventory.md`입니다. `SpaceStatus`, `DetectionEvent`, `AlertRule`, `ResidentRiskSummary`, `VideoClip` 등 일부 프론트 타입은 아직 화면 호환용이며, 동명의 백엔드 CRUD route가 존재한다는 뜻이 아닙니다. `src/data/mockData.ts`와 `src/services/db.ts`는 가역 숨김된 관리자 페이지 전용 비활 fixture이며 현재 런타임 경로가 아닙니다.

---

## 실제 백엔드 연동 계약

기본 개발 런타임은 실제 백엔드 경로입니다. `src/services/apiClient.ts`가 `VITE_API_BASE_URL`(기본 `/api/v1`)로 요청하고 `credentials: "include"`를 붙입니다.

### 인증·시설 스코프

- 이메일/비밀번호: `POST /api/v1/auth/login`
- Kakao OAuth 시작/콜백: `GET /api/v1/auth/kakao/login`, `GET /api/v1/auth/kakao/callback`
- 부트스트랩: `GET /api/v1/auth/me`
- 로그아웃: `POST /api/v1/auth/logout`
- 회원가입/초기 시설 생성: `POST /api/v1/auth/register`
- 온보딩 시설 생성: `POST /api/v1/facilities`
- 시설 목록/상세: `GET /api/v1/facilities`, `GET /api/v1/facilities/:id`

브라우저 세션은 백엔드가 발급한 httpOnly `app_session` JWT 쿠키입니다. 프론트 localStorage 세션이나 `ServerSession`/`SessionGuard`/`current-facility` API는 현재 계약이 아닙니다. 시설-bound 사용자는 JWT의 `facilityId`가 스코프이고, `SUPER_ADMIN`은 fetch/XHR에서 `X-Facility-Id`, native `EventSource`에서 `facilityId` query param으로 선택한 시설을 전달합니다.

### 현재 API 표면

실제 컨트롤러가 제공하는 route만 사용합니다: 시설, 층, 공간, 공간 하위 구역, 입소자와 배정, 카메라, 보호자, 알림, 스냅샷, dashboard SSE, Event API(`POST /api/v1/events`, `POST /api/v1/events/heartbeat`, `GET /api/v1/events`). 제거된 `/api/v1/status`, `/api/v1/space-statuses`, `/api/v1/resident-risk-summaries`, `/api/v1/detection-events`, `/api/v1/alert-rules`, `/api/ai/detection-result`, 영상 presign/access-log route는 현재 계약으로 문서화하지 않습니다.

### 실시간 반영

대시보드 실시간 반영은 `GET /api/v1/dashboard/stream` SSE입니다. 프론트 `buildSseUrl(facilityId)`는 `EventSource` 제한 때문에 `?facilityId=<id>` query selector를 사용하고, 일반 fetch/XHR은 `X-Facility-Id` 헤더를 사용합니다.

---

## 층별 대형 모니터 현황판 (Floor Monitor Mode)

각 층 간호사실·복도·야간 스테이션의 큰 모니터/TV에 **상시 띄워두는** 화면입니다. 실제 CCTV 영상은 없지만 인원·움직임·위험도·메시지·감지시각이 자동으로 갱신되어 "상태가 살아 움직이는" 현황판처럼 보입니다. 관제센터가 아니라 병동 현황판/관제판의 명확함을 지향합니다.

- **경로**: `/dashboard`(전체 보기) → `/dashboard/floor/:floorId`(층별), `/dashboard/alerts`(확인한 알림). 진입 버튼은 직원/관리자 헤더에 있습니다.
- **멀리서도 보이는 대형 타이포**: 공간명 42px+, 인원 56px+, 상태 36px+, 설명 28px+. 위험 우선 정렬 + 큰 카드 그리드(공간 수에 따라 2×2/3열 자동).
- **마우스 없이 자동 갱신**: 백엔드 dashboard SSE와 알림 REST read-model이 공간 상태를 갱신합니다. 안정/주의/위험 상태는 백엔드 이벤트와 스냅샷을 기준으로 반영되고, 위험은 확인 전까지 계속 강조됩니다.
- **상단 정보**: 시설명 · 층 제목 · 실시간 시계 · "N초 전 갱신" 인디케이터 · 연결 상태(정상/지연/재연결/끊김) · 층 요약(안정·주의·위험) · 위험 배너.
- **조작 최소화**: 층 선택 / 전체 화면(Fullscreen API, ESC 해제) / 알림음 켜기·끄기(기본 꺼짐, 야간엔 시각 강조 우선) / 카드 클릭 시 오른쪽 슬라이드 상세. 관리자 메뉴·복잡한 설정은 노출하지 않습니다.
- **권한별 상세**: 카드 클릭 시 직원은 요약+조치 버튼만, 관리자는 관리자 이벤트 상세 화면(`/admin/events/:eventId`)에서 추가 정보를 확인합니다. 프론트 가드는 UX 목적이고 백엔드 capability RBAC가 최종 방어선입니다.
- **관리자 설정**(`/admin/monitor-settings`): 기본 표시 층, 갱신 간격, 알림음, 야간 모드, 카드 크기, 표시할 공간 선택, 전체 보기 허용. 이 모니터(브라우저)에 저장됩니다.
- **반응형**: 55인치 TV(아주 큰 카드 2×2/3열) · 태블릿(2열) · 모바일(세로 리스트로 전환).

**실제 연동**: `stores/monitorStore.ts`가 `GET /api/v1/dashboard/stream` SSE와 알림 REST read-model을 합쳐 화면 상태를 갱신합니다.

### 실제 시설 구조 · 현실형 실시간 변화

시설은 실제 구조(B1·1F·2F·3F·4F, 총 54공간)로 구성됩니다. 2~4F는 각 호실 10 + 중앙/좌측/우측 복도 + 프로그램실 = **14공간**이 한 화면에 들어갑니다(55인치 TV 기준 최대 5열). 상단에 "전체 14 · 안정 11 · 주의 2 · 위험 1 · 총 감지 인원 24명" 요약을 표시합니다.

공간 상태와 요약은 백엔드 dashboard 스냅샷과 알림 이벤트를 기준으로 갱신됩니다. 프론트는 선택한 시설 스코프를 fetch/XHR에서는 `X-Facility-Id`, SSE에서는 `facilityId` query param으로 전달합니다.

### 적응형 레이아웃 (평상시 압축 → 상황 시 확대)

"상시 관제판"이 아니라 "상황 발생 시 커지는 안전 현황판"입니다. 평상시(NORMAL)는 14개 공간이 작고 조용한 압축형, 상황 발생 시 자동 확대됩니다:

- **주의(ATTENTION)**: 해당 공간만 ~1.5배 확대, 나머지 압축.
- **위험(DANGER)**: 위험 공간을 대형 강조 영역에, 나머지는 압축 유지.
- **응급(EMERGENCY)**: 화면 중앙 대형 오버레이 + 배경 딤. 바닥 자세/낙상 등.
- **자동 복귀 금지**: 주의는 시간이 지나면 안정으로 돌아갈 수 있지만, **위험/응급은 확인 완료 전까지 유지**됩니다. 카드의 "확인 완료" 버튼을 누르면 평상시로 복귀하고 음성 안내도 멈춥니다.

컴포넌트: `AdaptiveMonitorLayout`, `CompactSpaceCard`, `ExpandedAlertCard`, `EmergencyOverlay`, `AcknowledgementButton`.

### TTS 음성 안내 (AI 안전 도우미)

화면을 보지 않아도 어디를 확인해야 하는지 음성으로 알려줍니다. 헤더의 "음성 안내" 토글로 켜며(기본 꺼짐), 한국어 여성·차분한 톤입니다.

- **우선순위 큐**: 응급 > 위험 > 주의. 동시에 여러 건이면 먼저 "현재 확인이 필요한 공간이 N곳 있습니다" 요약 후 개별 안내.
- **문구**: 주의 "○○호 확인해 주세요" · 위험 "○○호 확인이 필요합니다. (사유)" · 응급 "○○호 응급 상황입니다. 직원 확인이 필요합니다."
- **재안내**: 30초 → 2분 → 5분 간격. 동일 이벤트 중복 재생 금지. **확인 완료 시 즉시 중단.**
- **Provider 패턴**: MVP는 브라우저 `SpeechSynthesis`. 상용화 시 `TTSProvider` 인터페이스만 구현하면 **Naver CLOVA Voice / Google Cloud TTS**로 교체 가능(상위 큐/스케줄 로직 불변). 파일: `services/tts/ttsProvider.ts`, `services/tts/ttsManager.ts`, `hooks/useTTSAlerts.ts`.

> 브라우저 음성 정책상 첫 음성은 화면을 한 번 클릭/상호작용한 뒤 재생됩니다(자동재생 차단 대응).

#### 음성 사전 생성 (mp3 캐시)

실시간마다 TTS API를 호출하지 않도록, 자주 쓰는 안내 문구를 **미리 mp3로 생성**해 두고 재생합니다.

```bash
pnpm --filter front gen:tts        # Mock(키 없음): 폴더 구조 + manifest 생성, 런타임은 음성 폴백
CLOVA_CLIENT_ID=... CLOVA_CLIENT_SECRET=... pnpm --filter front gen:tts   # 실제 mp3 생성
GOOGLE_TTS_API_KEY=... pnpm --filter front gen:tts                        # Google TTS 로 생성
```

- 문구/공간을 조합해 `public/audio/tts/<층>/<호실>_<단계>.mp3`, `public/audio/tts/common/<슬러그>_<단계>.mp3`, `summary.mp3`를 생성합니다. (예: `201호 확인이 필요합니다` → `/audio/tts/2F/201_danger.mp3`, `중앙복도 단독 이동…` → `/audio/tts/common/center_hallway_danger.mp3`)
- 생성 결과는 `manifest.json`에 `real: true/false`로 기록되고, 런타임 `playTTS`는 **실제 파일이 있으면 `Audio`로 재생, 없으면 브라우저 음성으로 폴백**합니다. 그래서 키가 없어도 동작하고, 키를 넣어 한 번 생성하면 자동으로 mp3 재생으로 전환됩니다.
- 중복 재생 방지·우선순위(응급>위험>주의)·확인 완료 시 중단은 `ttsManager`가 담당합니다.
- 파일: `scripts/generate-tts.ts`, `src/services/tts/{ttsConfig,audioMap,ttsProvider,synthesizer,playTTS,ttsManager}.ts`. 문구를 바꾸려면 `pnpm --filter front gen:tts` 재실행하면 됩니다.

---

## 개발 원칙 (PoC First · SaaS Ready · Privacy First · Camera Agnostic · Senior-Friendly)

행복한요양원 녹양역점에서 바로 검증할 **PoC**가 1차 목표이되, 구조는 처음부터 **SaaS Ready**로 설계합니다.

- **SaaS Ready**: 핵심 백엔드 엔티티는 `facilityId`를 통해 시설 스코프를 가집니다(Facility·Floor·Space·Zone·Resident·ResidentAssignment·Guardian·Camera·Alert 등). 프론트 경로는 역할 다형 진입점(`/dashboard`, `/admin/*`)을 사용하고, API 요청은 cookie JWT + `X-Facility-Id`/SSE query selector 계약을 따릅니다.
- **Privacy First — 얼굴 인식 미사용**: 로그인·층 선택·모니터 헤더·배정 화면에 "얼굴 인식을 사용하지 않습니다" 안내를 명시했습니다(`PrivacyNotice`). AI는 "어느 공간/구역에서 어떤 행동인지"만 알고, "그 사람이 누구인지"는 모릅니다. 개인 매핑(202호 침대A → 김○○)은 요양원 DB(`ResidentAssignment`)에서만 관리합니다.

### 구역/침대(Zone) + 어르신 배정(ResidentAssignment)

공간 아래 **침대/구역 단위**로 이벤트를 다룹니다. 모든 호실에 침대A·침대B가 있고, 어르신을 침대에 배정하면 이벤트가 "**202호 침대A** 침상 이탈"처럼 표기됩니다(얼굴 인식 없이 침대 위치만).

- **관리자 · 구역/침대 배정**: `assignments` 관리자 화면은 가역 숨김 상태입니다. 재활성 시 `/admin/assignments` 아래에서 실백엔드로 배선합니다.
- 실제 백엔드 이벤트는 현재 camera/space/alert 중심이며 resident-risk-summary route는 없습니다. 구역/침대 배정 화면은 가역 숨김 상태이고, `services/zoneService.ts`는 해당 숨김 페이지 전용 비활 fixture입니다.
- 공간 상세 패널에 "구역/침대 배정" 표시, 관심 어르신 화면에 침대 위치 표기, 이벤트 타임라인에 구역 칩 표시.
- 서비스: `services/zoneService.ts`. 엔티티: `Zone`, `ResidentAssignment`.

> 이후 단계(로드맵): 실제 카메라 2~5대 연동(Camera Agnostic 어댑터), Rule Engine 명시화(주간/야간 침상 이탈, 바닥 자세=응급), 멀티 시설 확장.

### UX 검증 결과

현장 검증 결과는 별도 UX 테스트 라우트 없이 실제 관리자/직원 화면과 테스트에서 확인합니다. 발생 이벤트·확인 완료·평균 확인 시간·TTS 재생·도움 요청 + 이벤트별 확인 소요시간·누른 버튼은 제품 화면과 백엔드 이벤트/알림 계약 안에서 다룹니다.

---

## 관심 어르신 (Focus Resident)

AI가 오늘 더 자주 확인할 어르신을 자동 선별해 보여줍니다. "감시 대상"이 아니라 "집중 관찰 지원" 톤으로 표현합니다(위험 인물·문제 행동 같은 표현 배제).

- **직원 화면**: "지금 확인할 곳"(`/dashboard`) 상단에 "오늘 집중 관찰 필요 N명" 섹션. 점수·모델 설명 없이 "○○호 ○○○ · 오늘 더 자주 확인해주세요. (이유)"만 보여주고 **확인함 / 직원 방문 중 / 도움 요청** 3버튼을 제공합니다. "음성으로 듣기" 버튼으로 TTS 안내를 들을 수 있습니다.
- **관리자 화면**: `focus-residents` 관리자 화면은 남아 있지만 가역 숨김 상태이며 현재 백엔드에는 `/api/v1/resident-risk-summaries` route가 없습니다. `services/residentService.ts`와 fixture 데이터는 재활성 전까지 비활 fixture로만 보존합니다.
- **TTS 안내**: "오늘 집중 관찰 대상은 N분입니다." → "○○호 ○○○ 어르신을 더 자주 확인해주세요." 순으로 짧고 명확하게 안내(`services/tts/announceFocus.ts`).
- **데이터 모델**: `Resident`와 배정 정보는 실제 백엔드 route가 있고, `ResidentRiskSummary`/`ResidentAction`은 현재 프론트 UI 호환 타입입니다.

---

## 확장성 (SaaS 멀티테넌트)

- 모든 실제 백엔드 엔티티 요청은 시설 스코프로 필터링됩니다. `SUPER_ADMIN`의 시설 전환은 `GET /api/v1/facilities` 목록과 선택한 시설 스코프(`X-Facility-Id` 또는 SSE `facilityId` query)로 동작합니다.
- 층/공간/구역/카메라/보호자/입소자/배정은 실제 관리자 API가 있습니다. 알림규칙 route는 현재 제거되어 있으므로 관리자 화면의 alert-rule UI는 백엔드 계약으로 문서화하지 않습니다.
- 한국어 라벨이 `lib/labels.ts`에 격리되어 다국어/시설별 용어 커스터마이징이 용이합니다.

**운영 전 권장:** Postgres + 시설 단위 Row-Level Security, 테넌트별 데이터 격리 테스트, 카메라/공간 매핑 검증 화면.

---

## 보안 · 개인정보 고려사항

- **CCTV 원본 미노출**: 설계상 영상 스트림이 프론트에 존재하지 않습니다. AI 분석 결과(상태·요약)만 전달됩니다 — 개인정보·초상권 리스크 최소화.
- **권한 분리**: `RequireAuth`가 라우트 단위로 최소 권한을 강제하고, 로그인 사용자는 자기 시설 데이터만 조회합니다. (운영에서는 **서버 측 권한 검증이 최종 방어선** — 프론트 가드는 UX 목적)
- **세션**: 인증 세션은 백엔드 `app_session` httpOnly JWT 쿠키가 소유하고 `GET /api/v1/auth/me`로 복원합니다. 프론트 localStorage auth 세션과 별도 서버-session API는 사용하지 않습니다.
- **민감 알림**: 카카오톡 메시지에 어르신 식별정보를 최소화하고 공간 단위로만 표기 (현재 템플릿 준수).
- **감사 로그**: 모든 조치(`ActionLog`)에 작성자·시각이 남아 보호자/감독기관 신뢰성 확보에 활용 가능.
- **카피라이팅**: "감시/추적/관제" 대신 "안전 확인/돌봄 지원" 용어를 일관 사용.

---

## 알려진 제약

실제 백엔드 경로가 단일 런타임입니다. 사용자 계정 생성/권한 변경 UI, 영상 전용 API, resident-risk-summary 연동, alert-rule 백엔드 연동은 후속 범위입니다.
