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

dev/prod 로그인은 백엔드가 소유합니다. 이메일/비밀번호는 `POST /auth/login`,
Kakao OAuth는 `/auth/kakao/login`으로 시작하며, 두 경로 모두 백엔드가 같은
httpOnly 쿠키 세션을 만든 뒤 프론트가 `/auth/session`으로 복원합니다. 처음
로그인한 계정이 아직 시설에 연결되지 않았다면 `/onboarding`에서
`POST /api/facilities`로 시설을 등록합니다.

로컬 seed 계정은 `super@sen.ai`, `admin@sen.ai`, `staff@sen.ai`이며 비밀번호는
`DEMO_LOGIN_PASSWORD` 또는 기본값 `1234`입니다. 이는 백엔드 seed 데이터일 뿐
프론트 mock 로그인 경로가 아닙니다.

---

## 사용자 모드 분리 (현장 직원 우선 UX)

실제 주 사용자는 60대 이상 요양보호사·간호조무사·사회복지사·야간 근무자입니다. 그래서 "멋진 대시보드"가 아니라 **3초 안에 위험을 이해하고 바로 행동하는 안전 확인 도구**로 설계했습니다.

### 직원 모드 (`/now`, `/rooms`, `/alerts`) — 메뉴 3개만

- **지금 확인할 곳**: 로그인 후 첫 화면. 전체 대시보드가 아니라 위험/주의/확인필요 공간만, 위험 우선으로 큰 카드로 보여줍니다. 모두 안정이면 "지금은 모든 곳이 안정적입니다" 안내.
- **전체 방 상태**: 큰 층 탭 + 큰 카드.
- **확인한 알림**: 처리 완료된 알림 이력.
- **큰 글자·큰 버튼**: 공간명 28px, 상태 24px, 설명 19px, 버튼 21px·높이 56px+ (장갑 착용 대응). 색상 + 한글 문구 + 아이콘을 함께 사용(색약 대응).
- **조치 버튼 3개만**: 확인 완료 / 직원 방문 중 / 도움 요청. 추가 메모는 접어둠.
- **현장 문구만**: AI·confidence·detection·camera ID 같은 용어를 직원 화면에서 제거. "침대 주변 움직임이 많습니다" 식 한글 안내(`lib/staffCopy.ts`).
- **다크모드**: 야간(19~07시) 자동 다크 + 토글. 토큰(CSS 변수) 기반이라 모든 화면이 함께 전환됩니다.
- **소리·진동**: 새 위험 발생 시에만 부드러운 알림음 + 진동(토글 가능, `lib/alert.ts`).

### 관리자 모드 (`/admin/*`) — 설정·상세 데이터

상세 대시보드, 이벤트, 시설/층/공간/알림규칙/사용자 설정. 직원 화면에는 노출하지 않는 카메라 ID·신뢰도·관리 기능이 여기 모여 있습니다. 관리자 화면은 항상 라이트 모드.

---

## 이슈 근거 영상 (관리자 전용) · 보안 우선

이 기능은 **"실시간 CCTV 관제"가 아니라 "AI 위험 감지 근거 영상 확인"**입니다. AI가 위험으로 감지한 **이벤트 구간(감지 10초 전 ~ 10초 후, 약 20초)** 클립만 관리자에게 제공합니다.

- **권한 분리**: STAFF/VIEWER는 영상 영역 자체가 없고 "영상은 관리자만 확인할 수 있습니다" 안내만 표시. FACILITY_ADMIN/SUPER_ADMIN만 이벤트 상세(`/admin/events/:id`)에서 클립 확인.
- **보안 경계는 서비스 레이어**(`services/videoService.ts`): 권한 검증 → signed URL(토큰+5분 만료) 발급 → 모든 접근을 `VideoAccessLog`로 기록(누가/언제/무엇을). `clipUrl` 직접 노출 금지.
- **다운로드/외부 공유 비활성화**, 보관기간(`expiresAt`) 경과 시 자동 삭제, 이벤트와 무관한 전체 CCTV 탐색 기능 없음.
- **상태별 UI**: 클립 없음 / 생성 중(PROCESSING) / 만료 각각 안내 상태를 제공(`VideoUnavailableState`).
- 컴포넌트: `AdminEventVideoPlayer`(시뮬레이션 플레이어 + 감지시점 마커), `EventClipTimeline`, `VideoPermissionGuard`, `VideoAccessNotice`, `VideoUnavailableState`, `VideoAccessLogTable`.

**★ 실제 연동**: `GET /api/events/:id/video`, `GET /api/videos/:id/signed-url`(S3/NAS presign), `POST /api/videos/:id/access-log`. MVP는 더미 클립 + 시뮬레이션 재생이며, `videoService`의 3개 함수만 실제 스토리지 호출로 교체하면 됩니다. 데모: `203호`(재생 가능), `202호`(재생 가능), `302호`(생성 중 상태).

---

## 기술 스택

React 18 · TypeScript(strict) · Vite · Tailwind CSS · Zustand · React Router · Recharts · Lucide Icons. shadcn 톤의 경량 UI 프리미티브를 직접 구현해 외부 CLI 의존성을 없앴습니다.

---

## 폴더 구조

```
src/
├── types/index.ts          도메인 타입 (백엔드/AI와 공유하는 단일 소스)
├── data/mockData.ts        행복한요양원 녹양역점 더미 데이터
├── lib/                    utils · labels(한국어 라벨) · format(시간)
├── services/               ★ 교체 가능한 API/서비스 레이어 ★
│   ├── apiClient.ts        fetch 래퍼 (실제 백엔드 진입점)
│   ├── db.ts               인메모리 Mock DB
│   ├── authService.ts      로그인/세션
│   ├── dashboardService.ts 대시보드/공간 상태
│   ├── eventService.ts     이벤트 확인/조치
│   ├── adminService.ts     시설/층/공간/알림규칙 CRUD
│   ├── kakaoService.ts     ★ 카카오톡 알림 연동 지점 ★
│   └── aiIngestService.ts  ★ AI 감지결과 수신 파이프라인 ★
├── store/                  authStore(권한) · facilityStore(시설 선택)
├── components/             StatusCard, RiskBadge, StatusBadge, EventTimeline,
│                           AIInsightBox, KakaoAlertStatusBadge, ActionLogForm,
│                           FloorTabs, StatsBar, SpaceDetailPanel, layout/AppLayout ...
└── pages/                  LoginPage, DashboardPage, EventsPage,
                            admin/{Facility,Floors,Spaces,AlertRules,Users}Page
```

---

## 데이터 모델

`User · Facility · Floor · Space · SpaceStatus · DetectionEvent · ActionLog · AlertRule · VideoClip · VideoAccessLog`
전체 정의는 `src/types/index.ts`에 있습니다. 영상 관련 필드는 `DetectionEvent`에 욱여넣지 않고 **`VideoClip`/`VideoAccessLog` 별도 엔티티**로 분리했습니다. 원안 대비 개선 사항:

- `ActionLog`를 별도 엔티티로 분리해 한 이벤트에 **여러 조치 이력**을 누적 (확인→방문→이송 흐름 추적).
- `KakaoAlertStatus`에 `SENDING`/`FAILED`를 추가해 발송 실패를 UI에서 구분.
- `AlertRule.sensitivity`(공간별 민감도)를 명시 필드로 분리.
- `SpaceStatus`에 상세 신호(`bedsideActivity`/`prolongedInactivity`/`soloMovementAttempt`) 추가.

---

## ★ 향후 연동 지점 (명확화)

기본 개발 런타임은 실제 백엔드 모드입니다. 로그인/세션/시설 생성은 백엔드에 직접 연결되어 있고, 아직 mock 데이터에 남아 있는 화면은 실제 연동 시 **건드릴 파일이 격리**되어 있습니다.

### 1) 실제 백엔드 API
`src/services/apiClient.ts`는 `VITE_USE_MOCK`이 unset/`false`이면 실제 백엔드 모드로 동작하고, `VITE_API_BASE_URL` 기본값은 `/api`입니다. 인증은 `src/services/api/authEndpoints.ts`가 `/auth/login`, `/auth/session`, `/auth/kakao/login`, `/api/facilities`를 담당합니다. 남은 service 파일의 mock 호출만 `requestJson(...)`으로 교체하면 됩니다. 엔드포인트 시그니처는 요구사항 API 설계를 그대로 따릅니다 (`/api/facilities/:id/dashboard`, `/api/floors`, `/api/spaces`, `/api/events/:id/acknowledge` 등).

### 2) AI 예측 모델 → 백엔드
`src/services/aiIngestService.ts`의 `ingest(payload)`가 수신 처리 로직입니다. 실제로는 `POST /api/ai/detection-result`가 동일 payload(`facilityCode`, `cameraId`, `spaceId`, `peopleCount`, `movementLevel`, `fallRiskLevel`, `eventType`, `aiSummary`, `confidence`)를 받아 ① SpaceStatus 업데이트 ② DetectionEvent 생성 ③ 알림 규칙 확인 ④ 카카오톡 발송 ⑤ 대시보드 반영을 수행합니다. 프론트 데모에서 이 함수로 실시간 유입을 시뮬레이션할 수 있습니다.

### 3) 카카오톡 알림
`src/services/kakaoService.ts`의 `send()` 내부만 실제 카카오 알림톡(비즈메시지) API 호출로 교체하면 됩니다. 메시지 템플릿 빌더(`buildKakaoMessage`)와 수신자/발송결과 처리가 이미 분리되어 있습니다.

### 4) 실시간 반영
현재 대시보드는 20초 폴링입니다. 운영 단계에서는 **WebSocket 또는 SSE**로 교체 권장 (`DashboardPage`의 폴링 지점 한 곳).

---

## 층별 대형 모니터 현황판 (Floor Monitor Mode)

각 층 간호사실·복도·야간 스테이션의 큰 모니터/TV에 **상시 띄워두는** 화면입니다. 실제 CCTV 영상은 없지만 인원·움직임·위험도·메시지·감지시각이 자동으로 갱신되어 "상태가 살아 움직이는" 현황판처럼 보입니다. 관제센터가 아니라 병동 현황판/관제판의 명확함을 지향합니다.

- **경로**: `/monitor`(층 선택) → `/monitor/floor/:floorId`(층별), `/monitor/all`(전체 보기). 진입 버튼은 직원/관리자 헤더에 있습니다.
- **멀리서도 보이는 대형 타이포**: 공간명 42px+, 인원 56px+, 상태 36px+, 설명 28px+. 위험 우선 정렬 + 큰 카드 그리드(공간 수에 따라 2×2/3열 자동).
- **마우스 없이 자동 갱신**: `mockRealtimeEngine`이 2~5초마다 일부 공간 상태를 바꿉니다. 안정이 대부분, 주의는 가끔, **위험은 드물게 발생하고 12~20초 유지**(확인 전까지 계속 강조). 위험/주의 카드는 부드러운 pulse(사이렌 느낌은 배제).
- **상단 정보**: 시설명 · 층 제목 · 실시간 시계 · "N초 전 갱신" 인디케이터 · 연결 상태(정상/지연/재연결/끊김) · 층 요약(안정·주의·위험) · 위험 배너.
- **조작 최소화**: 층 선택 / 전체 화면(Fullscreen API, ESC 해제) / 알림음 켜기·끄기(기본 꺼짐, 야간엔 시각 강조 우선) / 카드 클릭 시 오른쪽 슬라이드 상세. 관리자 메뉴·복잡한 설정은 노출하지 않습니다.
- **권한별 상세**: 카드 클릭 시 직원은 요약+조치 버튼만, 관리자는 이슈 영상·타임라인·접근로그까지(기존 권한 분리 그대로 재사용). 확인 처리 시 실시간 엔진의 위험도 함께 해제됩니다.
- **관리자 설정**(`/admin/monitor-settings`): 기본 표시 층, 갱신 간격, 알림음, 야간 모드, 카드 크기, 표시할 공간 선택, 전체 보기 허용. 이 모니터(브라우저)에 저장됩니다.
- **반응형**: 55인치 TV(아주 큰 카드 2×2/3열) · 태블릿(2열) · 모바일(세로 리스트로 전환).

**★ 실제 연동**: `src/mocks/realtimeEngine.ts`를 WebSocket/SSE/폴링으로 교체하면 됩니다. `subscribe()/getSnapshot()` 인터페이스만 유지하면 UI는 변경이 없습니다. 흐름: `AI Model → /api/ai/detection-result → SpaceStatus 갱신 → WebSocket publish → 엔진 emit 자리 → Monitor 실시간 반영`. 관련 파일: `mocks/realtimeEngine.ts`, `stores/monitorStore.ts`, `stores/monitorSettingsStore.ts`, `hooks/useRealtimeSpaceStatus.ts`.

### 실제 시설 구조 · 현실형 실시간 변화

시설은 실제 구조(B1·1F·2F·3F·4F, 총 54공간)로 구성됩니다. 2~4F는 각 호실 10 + 중앙/좌측/우측 복도 + 프로그램실 = **14공간**이 한 화면에 들어갑니다(55인치 TV 기준 최대 5열). 상단에 "전체 14 · 안정 11 · 주의 2 · 위험 1 · 총 감지 인원 24명" 요약을 표시합니다.

엔진은 무작위가 아니라 **시간대 생활 패턴 + 공간 유형**을 반영합니다. 기상(06–08:30)·식사·프로그램·휴식·취침(19–22)·야간(22–06)마다 호실/복도/식당/프로그램실의 인원과 상태가 다르게 생성되고, 인원은 목표치를 향해 ±1씩 점진 변화(0→8 급변 없음)합니다. 프로그램실·식당·물리치료실의 활발한 움직임은 위험으로 오인하지 않습니다. 위험은 드물게(데모 약 2~3분 1회) 발생하고 **확인 전까지 유지**됩니다. 관리자 설정의 **데모 모드**(평상/식사/프로그램/야간/위험 데모)로 시간대를 강제 시연할 수 있습니다.

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

- **SaaS Ready**: 모든 핵심 엔티티가 `facilityId`를 가집니다(Facility·Floor·Space·Zone·Resident·ResidentAssignment·DetectionEvent·ActionLog·AlertRule·VideoClip). 기본 `facilityCode=happy-nokyang`. 현재 URL은 `/monitor/floor/:floorId`이며, 향후 `/facilities/:facilityId/...`로 확장 가능한 구조입니다.
- **Privacy First — 얼굴 인식 미사용**: 로그인·층 선택·모니터 헤더·배정 화면에 "얼굴 인식을 사용하지 않습니다" 안내를 명시했습니다(`PrivacyNotice`). AI는 "어느 공간/구역에서 어떤 행동인지"만 알고, "그 사람이 누구인지"는 모릅니다. 개인 매핑(202호 침대A → 김○○)은 요양원 DB(`ResidentAssignment`)에서만 관리합니다.

### 구역/침대(Zone) + 어르신 배정(ResidentAssignment)

공간 아래 **침대/구역 단위**로 이벤트를 다룹니다. 모든 호실에 침대A·침대B가 있고, 어르신을 침대에 배정하면 이벤트가 "**202호 침대A** 침상 이탈"처럼 표기됩니다(얼굴 인식 없이 침대 위치만).

- **관리자 · 구역/침대 배정**(`/admin/assignments`): 층 선택 → 호실별 침대에 어르신 배정/해제, 침대 추가/삭제.
- 실시간 엔진의 호실 위험 이벤트는 배정된 침대(없으면 임의 침대)를 포함해 생성됩니다.
- 공간 상세 패널에 "구역/침대 배정" 표시, 관심 어르신 화면에 침대 위치 표기, 이벤트 타임라인에 구역 칩 표시.
- 서비스: `services/zoneService.ts`. 엔티티: `Zone`, `ResidentAssignment`.

> 이후 단계(로드맵): 실제 카메라 2~5대 연동(Camera Agnostic 어댑터), Rule Engine 명시화(주간/야간 침상 이탈, 바닥 자세=응급), 멀티 시설 확장.

### 2층 UX 검증 모드 (`/poc/2f`)

"AI가 정확한가?"가 아니라 **"선생님들이 이걸 보고 실제로 움직이는가?"**를 검증하는 화면입니다. 개인정보(이름·진단명·얼굴) 일절 사용 안 함 — 공간/침대/복도/상태만.

- **현재 확인 필요 패널**: 주의/위험/응급을 크게 우선 표시(침대A/B는 이벤트 시에만). 위험 없으면 "현재 즉시 확인할 공간은 없습니다".
- **추천 순찰 순서**: "어디부터 가야 하지?"를 고민하지 않게 1·2·3 순서 제시(위험 우선, 없으면 일반 순찰).
- **시나리오 선택**: 평상시 / 저녁 식사 후 / 취침 준비 / **야간 순찰(기본)** / 위험 이벤트 테스트. **응급 테스트** 버튼으로 응급 수동 발생.
- **낮은 알림 빈도**: 엔진 `POC_2F` 프로파일이 주의/위험 확률을 낮추고 위험 최소 간격을 5분으로(피로감 방지). 위험/응급은 확인 전까지 유지.
- **TTS 이름 없이**: "203호 확인이 필요합니다", "중앙복도 이동이 감지되었습니다", "203호 응급 상황입니다".
- **확인 완료 플로우**: 큰 버튼 → 이벤트 확인 처리 → 카드 안정 복귀 → 확인 필요 목록/순찰 갱신 → TTS 중단.
- **UX 검증 로그**(`/admin/ux-test`): 발생 이벤트·확인 완료·평균 확인 시간·TTS 재생·도움 요청 + 이벤트별 확인 소요시간·누른 버튼.
- **직원 피드백**: 화면 하단 5문항(예/아니오+메모) → 관리자 결과 화면에서 확인.
- 파일: `pages/poc/PocFloor2Page.tsx`, `components/poc/*`, `stores/uxTestStore.ts`, `stores/feedbackStore.ts`, `pages/admin/UxTestResultPage.tsx`.

---

## 관심 어르신 (Focus Resident)

AI가 오늘 더 자주 확인할 어르신을 자동 선별해 보여줍니다. "감시 대상"이 아니라 "집중 관찰 지원" 톤으로 표현합니다(위험 인물·문제 행동 같은 표현 배제).

- **직원 화면**: "지금 확인할 곳"(`/now`) 상단에 "오늘 집중 관찰 필요 N명" 섹션. 점수·모델 설명 없이 "○○호 ○○○ · 오늘 더 자주 확인해주세요. (이유)"만 보여주고 **확인함 / 방문 예정 / 도움 요청** 3버튼을 제공합니다. "음성으로 듣기" 버튼으로 TTS 안내를 들을 수 있습니다.
- **관리자 화면**(`/admin/focus-residents`): 위험도, 위험 행동 횟수(침상 이탈·배회·기립 시도·복도 이동), **전일 대비 증감**, AI 판단 근거·권장 조치, 위험 점수, 관련 근거 영상(이벤트 상세로 이동), 최근 이벤트 타임라인, 조치 기록까지 확인합니다.
- **TTS 안내**: "오늘 집중 관찰 대상은 N분입니다." → "○○호 ○○○ 어르신을 더 자주 확인해주세요." 순으로 짧고 명확하게 안내(`services/tts/announceFocus.ts`).
- **데이터 모델**: `Resident`, `ResidentRiskSummary`(오늘/전일), `ResidentAction`. 더미: 202호 김○○(파킨슨·치매, 침상 이탈 3회·낙상 높음), 203호 이○○(배회), 401호 박○○(반복 기립). 서비스: `services/residentService.ts`.

---

## 확장성 (SaaS 멀티테넌트)

- 모든 엔티티가 `facilityId`를 보유하고, 서비스 레이어가 시설 단위로 필터링합니다. 두 번째 시설(`햇살가득요양원 의정부점`)을 더미로 포함해 SUPER_ADMIN의 시설 전환을 시연합니다.
- 층/공간/카메라/알림규칙을 모두 관리자 화면에서 비개발자가 추가·수정할 수 있어, 새 시설 온보딩이 코드 변경 없이 가능합니다.
- 한국어 라벨이 `lib/labels.ts`에 격리되어 다국어/시설별 용어 커스터마이징이 용이합니다.

**운영 전 권장:** Postgres + 시설 단위 Row-Level Security, 테넌트별 데이터 격리 테스트, 카메라/공간 매핑 검증 화면.

---

## 보안 · 개인정보 고려사항

- **CCTV 원본 미노출**: 설계상 영상 스트림이 프론트에 존재하지 않습니다. AI 분석 결과(상태·요약)만 전달됩니다 — 개인정보·초상권 리스크 최소화.
- **권한 분리**: `RequireAuth`가 라우트 단위로 최소 권한을 강제하고, 로그인 사용자는 자기 시설 데이터만 조회합니다. (운영에서는 **서버 측 권한 검증이 최종 방어선** — 프론트 가드는 UX 목적)
- **세션**: 인증 세션은 백엔드 `app_session` httpOnly 쿠키와 서버 세션 레코드가 소유합니다. 프론트 localStorage auth 세션은 사용하지 않습니다.
- **민감 알림**: 카카오톡 메시지에 어르신 식별정보를 최소화하고 공간 단위로만 표기 (현재 템플릿 준수).
- **감사 로그**: 모든 조치(`ActionLog`)에 작성자·시각이 남아 보호자/감독기관 신뢰성 확보에 활용 가능.
- **카피라이팅**: "감시/추적/관제" 대신 "안전 확인/돌봄 지원" 용어를 일관 사용.

---

## 알려진 제약 (MVP)

데이터는 인메모리이므로 새로고침 시 일부 변경(층/공간 추가 등)은 seed로 리셋됩니다. 사용자 계정 생성/권한 변경 UI, 실시간 소켓, 차트 분석 화면은 후속 버전 범위입니다.
