# Senior AI Lab — 프로젝트 컨텍스트 (LLM 핸드오프 문서)

> 이 문서는 ChatGPT/Claude 등 다른 AI가 이 코드베이스를 **처음부터 끝까지 이해**하도록 작성한 단일 컨텍스트 파일입니다.
> 코드의 실제 구조·데이터 모델·연동 지점·설계 원칙을 모두 담았습니다. 추가 작업을 요청할 때 이 파일을 같이 주면 됩니다.

---

## 1. 제품 한 줄 정의

**Senior AI Lab (제품명: Senior AI Watch)** 는 요양원 CCTV 영상을 **직접 노출하지 않고**, AI가 분석한 **공간·구역(침대) 단위 안전 상태**만 대형 모니터·웹 UI로 보여주는 **AI 안전 운영 플랫폼**이다.

- CCTV 관제 시스템이 **아니다**.
- 얼굴 인식 시스템이 **아니다** (절대 구현 금지).
- 주 사용자는 **60대 이상 요양보호사·간호조무사·사회복지사·야간 근무자**. → "3초 안에 위험을 이해하고 바로 행동"이 최우선.

기준 시설: **행복한요양원 녹양역점** (`facilityCode = happy-nokyang`, `facilityId = fac_happy_nokyang`).

---

## 2. 5대 개발 원칙 (모든 의사결정 기준)

1. **PoC First** — 완성형 SaaS가 아니라 현장 검증용 PoC 우선. 과한 멀티테넌트/권한/결제/고급 AI 지양.
2. **SaaS Ready** — 모든 핵심 엔티티에 `facilityId` 포함. 향후 `/facilities/:facilityId/...` 확장 가능 구조.
3. **Privacy First** — 얼굴 인식/등록/임베딩/추적/사진 업로드/얼굴 기반 식별 **전부 금지**. AI는 "어느 공간·구역, 어떤 행동"만 안다. 개인 매핑(202호 침대A→김○○)은 요양원 DB(`ResidentAssignment`)에서만 관리.
4. **Camera Agnostic** — 특정 CCTV 업체 비종속. RTSP/ONVIF/Screen Capture/File/Snapshot 지원 지향(현재는 데이터 모델/로드맵 단계).
5. **Senior-Friendly UX** — 큰 글자·큰 버튼·최소 영어·행동 우선·차분한 색.

모든 화면은 다음에 답해야 한다: ① 지금 어디가 위험한가 ② 누가 먼저 확인하나 ③ 왜 위험한가 ④ 어떤 조치를 하나 ⑤ 어떤 기록이 남았나.

---

## 3. 기술 스택 & 실행

- **React 18 + TypeScript(strict) + Vite 5**, **Tailwind CSS 3**, **Zustand**(상태), **React Router 6**, **lucide-react**(아이콘), **recharts**(설치만, 현재 미사용).
- shadcn 톤의 경량 UI 프리미티브를 직접 구현(외부 CLI 의존성 없음): `src/components/ui/primitives.tsx`.
- 폰트: Pretendard(CDN). 테마: CSS 변수 기반 라이트/다크.

```bash
pnpm install        # repo root에서 실행
pnpm --filter front dev        # http://localhost:3000
pnpm --filter front build      # tsc -b && vite build  (현재 빌드 통과, gzip ~121kB)
pnpm --filter front typecheck  # tsc -b
pnpm --filter front gen:tts    # TTS mp3 사전 생성 (키 없으면 mock)
```

**데모 계정** (비밀번호 전부 `1234`): `super@sen.ai`(통합관리자) · `admin@sen.ai`(시설관리자) · `staff@sen.ai`(케어 직원) · `viewer@sen.ai`(읽기전용). 로그인 후 누구나 **직원 모드(`/now`)** 로 진입, 관리자는 "관리자" 버튼으로 `/admin`.

---

## 4. 핵심 개념: 3개의 모드

| 모드 | 레이아웃 | 진입 | 대상 | 특징 |
|---|---|---|---|---|
| **직원 모드** | `StaffLayout` | `/now` `/rooms` `/alerts` | 요양보호사 등 | 메뉴 3개, 큰 글자/버튼, 다크모드, 현장 문구만 |
| **관리자 모드** | `AppLayout`(사이드바) | `/admin/*` | 원장/관리자/개발자 | 설정·상세 데이터·영상·배정, 항상 라이트 |
| **모니터 모드** | 자체 풀스크린 | `/monitor`, `/monitor/floor/:floorId`, `/monitor/all` | 각 층 대형 TV | 실시간·적응형 확대·TTS·전체화면 |

라우팅 정의: `src/router.tsx`. 가드: `src/components/RequireAuth.tsx`(인증 + 최소 권한). 기본 `facilityId`는 `facilityStore`가 사용자 시설로 resolve(없으면 `fac_happy_nokyang`).

---

## 5. 폴더 구조 (실제)

```
SeniorAILABFirst/
├─ scripts/generate-tts.ts        # TTS mp3 사전 생성(Node, tsx 실행)
├─ public/audio/tts/              # 생성된 mp3 + manifest.json + sentences.json
├─ src/
│  ├─ main.tsx, router.tsx, index.css, vite-env.d.ts
│  ├─ types/index.ts              # ★ 모든 도메인 타입(단일 소스) ★
│  ├─ data/mockData.ts            # ★ 행복한요양원 더미데이터(54공간 등) ★
│  ├─ lib/                        # utils, format(시간), labels(한글 라벨), staffCopy(현장 문구), alert(소리/진동)
│  ├─ services/                   # ★ 교체 가능한 API/서비스 레이어 ★
│  │  ├─ db.ts                    # 인메모리 Mock DB (실DB 도입 시 이 모듈만 교체)
│  │  ├─ apiClient.ts             # USE_MOCK 분기 + fetch 래퍼(실 백엔드 진입점)
│  │  ├─ authService / dashboardService / eventService / adminService
│  │  ├─ residentService / zoneService            # 관심 어르신, 구역·침대 배정
│  │  ├─ videoService.ts          # 영상 권한·signed URL·접근로그(보안 경계)
│  │  ├─ aiIngestService.ts       # AI 감지결과 수신 파이프라인(★연동지점)
│  │  ├─ kakaoService.ts          # 카카오 알림톡(★연동지점)
│  │  └─ tts/                     # ttsConfig, audioMap, ttsProvider, synthesizer, playTTS, ttsManager, announceFocus
│  ├─ store/                      # authStore(권한), facilityStore(시설), uiStore(테마/소리)
│  ├─ stores/                     # monitorStore(실시간 구독), monitorSettingsStore(모니터 설정)
│  ├─ mocks/realtimeEngine.ts     # ★ 현실형 실시간 엔진(시간대+공간유형) ★
│  ├─ hooks/                      # useDashboard, useRealtimeSpaceStatus, useTTSAlerts
│  ├─ components/
│  │  ├─ (공통) StatusCard, RiskBadge, StatusBadge, EventTimeline, AIInsightBox,
│  │  │        KakaoAlertStatusBadge, ActionLogForm, FloorTabs, StatsBar, SpaceDetailPanel,
│  │  │        PrivacyNotice, Logo, PageHeader, RequireAuth
│  │  ├─ layout/   AppLayout(관리자), StaffLayout(직원)
│  │  ├─ staff/    StaffSpaceCard, StaffStatusBadge, StaffConfirmSheet
│  │  ├─ monitor/  MonitorHeader, MonitorStatusCard, CompactSpaceCard, ExpandedAlertCard,
│  │  │            EmergencyOverlay, AdaptiveMonitorLayout, AlertBanner, LargeRiskBadge,
│  │  │            ConnectionStatusBadge, RealtimeUpdateIndicator, FloorSummaryStats,
│  │  │            SoundToggle, FullscreenButton, AcknowledgementButton, MonitorDetailDrawer
│  │  ├─ video/    AdminEventVideoPlayer, EventClipTimeline, VideoPermissionGuard,
│  │  │            VideoAccessNotice, VideoUnavailableState, VideoAccessLogTable
│  │  └─ resident/ FocusResidentSection
│  └─ pages/
│     ├─ LoginPage, DashboardPage(관리자 상세), EventsPage(관리자)
│     ├─ staff/  NowPage(지금 확인할 곳), RoomsPage(전체 방 상태), AlertsPage(확인한 알림)
│     ├─ monitor/ FloorSelectorPage(/monitor), FloorMonitorPage(층별·전체)
│     └─ admin/  AdminFacilityPage, AdminFloorsPage, AdminSpacesPage, AdminAssignmentsPage,
│               AdminAlertRulesPage, AdminMonitorSettingsPage, FocusResidentsPage,
│               AdminEventDetailPage(이슈 영상 상세), UsersPage
```

---

## 6. 데이터 모델 (전부 `src/types/index.ts`)

모든 엔티티는 `facilityId`를 가진다(SaaS Ready). 핵심 enum과 엔티티:

**Enum**: `Role`(SUPER_ADMIN|FACILITY_ADMIN|STAFF|VIEWER), `SpaceType`(ROOM|HALLWAY|PROGRAM_ROOM|REHAB_ROOM|DINING|LOBBY|OFFICE|NURSE_STATION|ENTRANCE|STORAGE|STAFF_LOUNGE|ETC), `SpaceStatusLevel`(STABLE|CAUTION|DANGER|CHECK_NEEDED), `Level`(LOW|MEDIUM|HIGH), `KakaoAlertStatus`(NONE|PENDING|SENDING|SENT|ACKNOWLEDGED|FAILED), `ZoneType`(BED|AREA), `ConnectionState`(NORMAL|RECONNECTING|DELAYED|DISCONNECTED), `DemoMode`(AUTO|NORMAL|MEAL|PROGRAM|NIGHT|RISK_DEMO).

**엔티티 관계**:
```
Facility 1─* Floor 1─* Space 1─* Zone(침대A/B)
Space 1─1 SpaceStatus(현재 상태)        Space 1─* DetectionEvent 1─* ActionLog
Resident *─1 Space(roomId)              Resident 1─* ResidentAssignment ─ Zone(침대)
Resident 1─* ResidentRiskSummary(오늘/전일)   Resident 1─* ResidentAction
DetectionEvent 1─0..1 VideoClip 1─* VideoAccessLog
Facility 1─* AlertRule    User *─1 Facility
```

- **SpaceStatus**: peopleCount, movementLevel, fallRiskLevel, status, aiSummary, lastDetectedAt, kakaoAlertStatus, (옵션) bedsideActivity/prolongedInactivity/soloMovementAttempt/**emergency**.
- **DetectionEvent**: eventType, riskLevel, message, aiSummary, **zoneId/zoneName**(침대), detectedAt, kakaoAlertStatus, acknowledgedBy/At, actions[], confidence, **emergency**.
- **Zone**: spaceId, name(침대A), type(BED), orderIndex.
- **ResidentAssignment**: residentId, spaceId, zoneId(침대), active, startedAt — **개인↔침대 매핑은 여기서만**.
- **Resident**: roomId, name(마스킹 "김○○"), gender, age, diagnosisTags[], fallRiskBaseline, isFocusResident.
- **ResidentRiskSummary**: date, bedExitCount/wanderingCount/standingAttemptCount/hallwayMoveCount/longInactivityCount, fallRiskScore(0~100), riskLevel, aiSummary, recommendedAction.
- **VideoClip**: eventId, cameraId, clipUrl(직접노출 금지), thumbnailUrl, clipStartAt/EndAt(감지±10초), durationSeconds, storageStatus(PROCESSING|AVAILABLE|EXPIRED|DELETED), accessLevel(ADMIN_ONLY), expiresAt. **VideoAccessLog**: 누가/언제/무엇을(VIEW|PLAY|FULLSCREEN|DOWNLOAD_BLOCKED).
- **AlertRule**: spaceId(nullable=시설기본), minRiskLevel, kakaoEnabled, recipients[], day/nightModeEnabled, sensitivity.
- **MonitorSettings**(localStorage): defaultFloorId, refreshMs, alertSound, nightMode, cardSize, visibleSpaceIds, allowAllView, **demoMode**.

---

## 7. 시설 구조 (더미, `src/data/mockData.ts`)

행복한요양원 녹양역점 = **54개 공간**.
- **B1**: 물리치료실, 프로그램실, 식당, 복도, 창고, 직원휴게공간
- **1F**(호실 없음): 로비, 상담실, 사무실, 간호스테이션, 중앙복도, 출입구
- **2F/3F/4F**(각 14공간): 호실 10개(201~210 등) + 중앙/좌측/우측 복도 + 프로그램실
- **Zone**: 모든 호실에 침대A·침대B. 배정 예: 김○○→202 침대A(파킨슨·치매, 낙상 높음), 이○○→203 침대A, 박○○→401 침대A.
- 초기 상태는 대부분 STABLE, 일부(202 주의/203 위험/302 확인필요) 시드. 영상 클립: 202·203(재생가능), 302(생성중).

---

## 8. 서비스 레이어 & ★연동 지점★

모든 화면은 `services/*`만 호출하고, 현재는 `db.ts`(인메모리)를 읽는다. 실제 백엔드 도입 시 service 내부만 `apiClient.request(...)`로 교체.

- **`apiClient.ts`**: `VITE_USE_MOCK` unset/`false`가 실제 백엔드 기본값이며 `VITE_API_BASE_URL` 기본값은 `/api`. 엔드포인트는 `/api/auth/*`, `/api/facilities/:id/dashboard`, `/api/spaces`, `/api/floors`, `/api/events/:id/acknowledge`, `/api/ai/detection-result`, `/api/alerts/kakao/send`, `/api/events/:id/video`, `/api/videos/:id/signed-url` 등.
- **`aiIngestService.ingest(payload)`** ★: AI 모델 → 백엔드 수신. payload(facilityCode, cameraId, spaceId, peopleCount, movementLevel, fallRiskLevel, eventType, aiSummary, confidence)를 받아 ① SpaceStatus 갱신 ② DetectionEvent 생성 ③ AlertRule 확인 ④ 카카오 발송 ⑤ 대시보드 반영.
- **`kakaoService.ts`** ★: `send()` 내부만 실제 카카오 알림톡 API로 교체. 메시지 템플릿/수신자 분리됨.
- **`videoService.ts`** ★ (보안 경계): 관리자 권한 검증 → signed URL(토큰+5분 만료) → 모든 접근 `VideoAccessLog` 기록. STAFF/VIEWER는 URL 자체를 못 받음.
- **`realtimeEngine`** ★: WebSocket/SSE로 교체(아래 9장). `subscribe()/getSnapshot()` 유지 시 UI 무변경.

---

## 9. 실시간 엔진 (`src/mocks/realtimeEngine.ts`)

정적 더미가 아니라 **시간대 생활패턴 + 공간유형 + 이전 상태**를 반영하는 모의 엔진.

- **DayPart**: 기상(06–08:30)/아침식사/오전프로그램/점심/휴식/오후프로그램/저녁/취침(19–22)/야간(22–06). `DemoMode`로 강제 가능.
- **시간대×유형별 목표 인원 범위**: 식사시간 식당 8~20명, 프로그램실 6~15명, 야간 복도 0~1명, 호실 휴식/야간 2~4명 등. 인원은 목표치로 **±1씩 점진 변화**(급변 없음).
- **상태 규칙**: 안정 기본. 프로그램실·식당·물리치료실의 활발한 움직임은 **위험으로 오인하지 않음**. 위험은 드물게(데모 약 2~3분 1회, throttle: 동시 위험 1곳·최소 간격). 호실 일부는 낙상 고위험. 호실 위험 이벤트는 **배정 침대(Zone)** 를 포함해 "202호 침대A …"로 생성.
- **자동 복귀 금지**: 위험/응급은 **확인(acknowledge) 전까지 유지**. 주의는 일정시간 후 안정 복귀 가능.
- **응급(emergency)**: 호실 위험 일부가 "바닥 자세 감지"로 격상.
- **연결 상태** 시뮬레이션(대부분 NORMAL, 드물게 DELAYED/RECONNECTING).
- 연결: `monitorStore.start()` → `engine.subscribe()` → snapshot을 store에 반영 → `useRealtimeSpaceStatus`가 화면에 제공(+총 감지 인원).

---

## 10. 적응형 모니터 레이아웃 (`AdaptiveMonitorLayout`)

"상시 관제판"이 아니라 "상황 발생 시 커지는 안전 현황판". `layoutMode`:
- **NORMAL**: 14개 공간 압축형(`CompactSpaceCard`, 작고 조용).
- **ATTENTION**(주의): 주의 카드 ~1.5배 확대(`ExpandedAlertCard`), 나머지 압축.
- **DANGER**(위험): 위험 카드 대형 강조, 나머지 압축.
- **EMERGENCY**(응급): 중앙 대형 오버레이(`EmergencyOverlay`) + 배경 딤.
- 카드 "확인 완료"(`AcknowledgementButton`) → `monitorStore.acknowledge(spaceId)` → 엔진 위험 해제 → 평상시 복귀 + TTS 중단.
- 위험 우선 정렬(`attentionRank`). 글자: 공간명 42px+, 인원 56px+ 등. 전체화면 API(`FullscreenButton`), 야간 다크모드, 연결상태/총인원/갱신시각 헤더.

---

## 11. TTS 음성 안내 (`src/services/tts/`)

화면을 안 봐도 음성으로 안내하는 "AI 안전 도우미". 한국어 여성·차분.

- **Provider 패턴**: `ttsProvider.ts`(런타임 재생, 브라우저 SpeechSynthesis) / `synthesizer.ts`(사전생성용 CLOVA·Google·Mock). 인터페이스만 구현하면 교체.
- **사전 생성 mp3**: `scripts/generate-tts.ts`가 `ttsConfig`(문구 템플릿) × 공간 조합으로 문장을 만들어 `public/audio/tts/<층>/<호실>_<단계>.mp3`, `common/<슬러그>_<단계>.mp3`, `summary.mp3` + `manifest.json` 생성. (예: `201호 확인이 필요합니다` → `/audio/tts/2F/201_danger.mp3`)
- **`audioMap.ts`**: (공간, 단계) → 경로/문장 매핑.
- **`playTTS.ts`**: manifest의 `real:true`면 `Audio`로 mp3 재생, 없으면 브라우저 음성으로 **폴백**. → 키 없어도 동작, 키 넣어 생성하면 자동으로 mp3 전환.
- **`ttsManager.ts`**: 우선순위 큐(응급>위험>주의), 동시 다발 시 "확인이 필요한 공간이 N곳" 요약 후 개별, 재안내 30초→2분→5분, 중복 방지, 확인 시 중단.
- **`announceFocus.ts`**: 관심 어르신 1회 음성 안내.
- 모니터 헤더 "음성 안내" 토글(`monitorStore.soundEnabled`, 기본 꺼짐). 브라우저 자동재생 정책상 첫 음성은 사용자 클릭 후 재생.

---

## 12. 주요 기능별 위치 빠른 색인

| 기능 | 파일 |
|---|---|
| 직원 첫 화면(지금 확인할 곳) + 관심 어르신 섹션 | `pages/staff/NowPage.tsx`, `components/resident/FocusResidentSection.tsx` |
| 직원 확인 시트(확인완료/방문중/도움요청) | `components/staff/StaffConfirmSheet.tsx` |
| 층별 모니터(적응형·TTS·전체화면) | `pages/monitor/FloorMonitorPage.tsx` |
| 관리자 이슈 영상 상세(권한·signed URL·접근로그) | `pages/admin/AdminEventDetailPage.tsx`, `services/videoService.ts` |
| 관심 어르신 상세(근거·증감·영상·조치) | `pages/admin/FocusResidentsPage.tsx`, `services/residentService.ts` |
| 구역/침대 배정 관리 | `pages/admin/AdminAssignmentsPage.tsx`, `services/zoneService.ts` |
| 모니터 표시 설정(데모모드·갱신·야간) | `pages/admin/AdminMonitorSettingsPage.tsx`, `stores/monitorSettingsStore.ts` |
| **2층 UX 검증 PoC**(확인필요·순찰·시나리오·응급테스트·피드백) | `pages/poc/PocFloor2Page.tsx`, `components/poc/*` |
| UX 검증 로그·결과 + 직원 피드백 | `pages/admin/UxTestResultPage.tsx`, `stores/uxTestStore.ts`, `stores/feedbackStore.ts` |
| 엔진 PoC 프로파일/수동 트리거 | `realtimeEngine.setProfile('POC_2F')`, `realtimeEngine.trigger(spaceId, emergency)` |
| 권한 헬퍼 | `store/authStore.ts`(hasRole/canAcknowledge/canAdmin) |
| 한글 라벨/현장 문구 | `lib/labels.ts`, `lib/staffCopy.ts` |

---

## 13. 권한 모델

- **SUPER_ADMIN**: 모든 시설, 시설 전환 가능. **FACILITY_ADMIN**: 자기 시설 + 모든 설정/영상. **STAFF**: 대시보드 조회·이벤트 확인·조치 기록. **VIEWER**: 읽기 전용.
- 프론트 가드(`RequireAuth`, `canAdmin/canAcknowledge`)는 UX 목적. **실제 데이터 격리·영상 권한은 서버 측 검증이 최종 방어선**이어야 함(시설 단위 RLS 권장).

---

## 14. 디자인 토큰 / 테마

- CSS 변수 토큰(`src/index.css`): `--c-bg/surface/ink/border/brand/...`, status(stable/caution/danger/check) + 각 bg. `.dark` 클래스가 야간 색으로 전환. Tailwind 색상이 이 변수에 매핑(`tailwind.config.js`).
- 상태색: 안정=초록, 주의=주황, 위험=빨강, 확인필요=파랑. **색상만이 아니라 항상 한글 문구+아이콘 병행**(색약 대응).

---

## 15. 알려진 제약 & 로드맵

**제약(PoC)**: 데이터는 인메모리 → 새로고침 시 일부 변경 리셋. 사용자 생성/권한 변경 UI 없음. 실시간은 mock 엔진. mp3는 키 없으면 mock(음성 폴백). 단일 시설 기본값.

**로드맵**: Phase2 실제 카메라 2~5대 연동(**Camera Agnostic 어댑터**: RTSP/ONVIF/Screen Capture/File) · Phase3 **Rule Engine 명시화**(주간/야간 침상 이탈, 야간 복도 단독=위험, 바닥 자세=응급, 고위험 어르신 침상 이탈=응급) · Phase4 사고 대응 근거 강화 · Phase5 멀티시설/권한/요금/계약·개인정보 문서.

**미구현(정책상 영구 금지)**: 얼굴 인식 일체.

---

## 16. 다른 AI에게 작업을 시킬 때 체크리스트

1. 새 엔티티엔 반드시 `facilityId` 포함(SaaS Ready).
2. 얼굴/개인 식별 기능 추가 금지(Privacy First). 개인 매핑은 `ResidentAssignment`로만.
3. 데이터 접근은 `services/*` 통해서. UI에서 `db.ts` 직접 import 금지(엔진/서비스 제외).
4. 직원 화면엔 점수·영어·camera ID·모델 설명 노출 금지. 관리자 화면에만 상세 근거.
5. 문구는 "집중 관찰/더 자주 확인/안전 확인" 사용, "감시/위험 인물/문제 행동/비정상" 금지.
6. 변경 후 `pnpm --filter front typecheck`(strict, noUnusedLocals) 통과 확인.
