# Frontend Architecture

이 문서는 `front/` Vite + React SPA가 backend를 어떻게 호출·수신하고, 화면 컴포넌트를 어떻게 재사용 가능한 계층으로 조립하는지 설명한다. 신규 합류자가 프론트 코드를 열기 전에 `apiClient` seam, SSE 갱신 흐름, 라우팅/RBAC, 컴포넌트 디렉터리의 역할을 빠르게 잡는 것이 목적이다.

## 1. SPA 런타임 개요

`front/`는 PRD/API 계약을 구현하는 Vite 5 + React 18 제품 frontend다. 로컬/운영 런타임의 기본값은 real backend 모드이며, `front/src/services/apiClient.ts`의 `API_BASE_URL` 기본값은 `VITE_API_BASE_URL ?? "/api/v1"`다. `VITE_USE_MOCK=true`는 `front/AGENTS.md`와 `front/src/AGENTS.md`가 명시하듯 자동테스트 전용이며, dev/prod의 demo 경로나 제품 런타임으로 취급하지 않는다.

운영 컨테이너에서는 `front/nginx.conf`가 정적 SPA를 서빙하고 `/api/`를 `backend:8080`으로 same-origin reverse proxy한다. 따라서 브라우저는 상대 경로(`/api/v1/...`)로 호출하고, backend session cookie는 same-origin 요청에 자동 포함된다.

```text
Browser SPA (:3000)
  ├─ static assets / client routes ──> Vite build served by nginx
  └─ /api/v1/* ──────────────────────> backend:8080 product API, auth/session/OAuth
```

## 2. Backend 호출 seam: service → apiClient

프론트의 backend 호출 경계는 `front/src/services/apiClient.ts`다. `requestJson()`과 `requestNoContent()`는 `buildApiUrl()`로 `/api/v1` base URL을 붙이고, real backend 모드에서는 기본 `credentials: "include"`로 cookie auth를 유지한다. 인증 endpoint도 `/api/v1/auth/*`로 호출한다.

```text
user action / page effect
  → domain service (`front/src/services/*.ts`)
  → endpoint mapper (`front/src/services/api/*.ts`, backend DTO parse/map)
  → `requestJson` / `requestNoContent` (`front/src/services/apiClient.ts`)
  → backend (`/api/v1/*`)
```

| 계층 | 주요 파일 | 책임 |
| --- | --- | --- |
| API client seam | `front/src/services/apiClient.ts` | `VITE_API_BASE_URL`, `/dashboard/stream` SSE URL 생성, `fetch` wrapper, cookie credentials, `ApiError` 표준화 |
| Endpoint mapper | `front/src/services/api/authEndpoints.ts` | backend DTO 검증·frontend type mirror 생성. 예: `loginEndpoint()`, `restoreSessionEndpoint()`, `parseRole()` |
| Workflow service | `front/src/services/{authService,dashboardService,eventService,adminService}.ts`, `front/src/features/admin-events/services/videoService.ts` | 페이지/훅이 호출하는 도메인 단위 유스케이스. 컴포넌트는 backend JSON shape나 `fetch()`를 직접 알지 않는다 |
| Local/test data seam | `front/src/services/db.ts`, `front/src/mocks/`, `front/src/data/` | 자동테스트 mock mode와 아직 backend wiring 전인 화면 데이터를 격리. dev/prod 기본 경로로 설명하지 않는다 |
| TTS side effect | `front/src/features/monitor/services/tts/*`(ttsManager 등), `front/src/features/monitor/hooks/useTTSAlerts.ts` | 화면 상태를 음성 알림 입력으로 변환하고 `ttsManager`에 동기화. `front/src/services/tts/{announceFocus,synthesizer}.ts`는 과거 경로의 no-op/빈 스텁이며 현재 어디서도 호출되지 않는다 |

현재 auth 흐름은 `front/src/services/authService.ts`가 `front/src/services/api/authEndpoints.ts`의 endpoint mapper를 호출한다. 예를 들어 `loginEndpoint()`는 `/api/v1/auth/login`, `restoreSessionEndpoint()`는 `/api/v1/auth/me`, `logoutEndpoint()`는 `/api/v1/auth/logout`을 `credentials: "include"`로 호출하고 `parseAuthSessionResponse()`가 `AuthSession`으로 매핑한다. `front/src/stores/authStore.ts`는 이 service를 감싸 `init()`, `login()`, `register()`, `logout()` 상태 전이를 담당한다.

대시보드/관리/이벤트/영상 service는 같은 seam을 향하도록 분리되어 있다. `dashboardService.ts`는 dashboard read-model shape(`DashboardResponse`)를 페이지에 제공하고, `eventService.ts`는 이벤트 확인·조치 유스케이스, `adminService.ts`는 시설/층/공간/알림규칙/사용자 관리 유스케이스, `videoService.ts`는 관리자 전용 event clip 권한·signed URL·access log 정책을 담당한다.

## 3. Backend 수신 방식: SSE 중심 갱신

실시간 backend push의 제품 계약은 `GET /api/v1/dashboard/stream` SSE다. API 계약상 session cookie auth와 `RequireFacilityGuard`가 적용되고, 브라우저의 native `EventSource`가 reconnect 시 마지막 수신 `id`를 `Last-Event-ID`로 보내면 backend는 bigint `alertSeq` cursor로 replay한다. Wire shape는 backend SSE controller/tests와 `../rules/realtime-sse-convention.md`가 소유하고, 이 문서는 프론트 소비 흐름만 요약한다.

### 실제 EventSource 구현 위치

실제 `EventSource` 생성은 `front/src/stores/monitorStore.ts`에 있다. 이 store의 `start(facilityId, intervalMs)`가 `buildSseUrl()`로 `/api/v1/dashboard/stream`을 만들고, URL이 absolute일 때만 `new EventSource(url, { withCredentials: true })`를 사용한다. same-origin 상대 URL(`/api/v1/dashboard/stream`)에서는 browser cookie가 자동 포함된다. `front/src/features/dashboard/hooks/useDashboard.ts`·`front/src/features/monitor/hooks/useRealtimeSpaceStatus.ts`는 이 store를 `start`하고 상태만 구독한다.

```text
backend alert stream
  → `GET /api/v1/dashboard/stream` (`EventSource`, cookie auth, Last-Event-ID replay)
  → `front/src/stores/monitorStore.ts` (`start`/`reload`, EventSource + polling fallback)
      - `event: alert` / `event: alert-updated` → `reload()`
      - `event: session-invalid` → close stream → `useAuthStore.logout()`
      - `onerror` → native reconnect 유지, polling fallback 유지
  → `dashboardService.getDashboard(facilityId)` read-model reload
  → page local state / stores
  → `DashboardPage`, staff/monitor components render
```

`front/src/services/apiClient.ts`의 `buildSseUrl()`은 `SSE_PATH = "/dashboard/stream"`를 `API_BASE_URL`에 붙이므로 기본 real backend 모드에서 `/api/v1/dashboard/stream`가 된다. `front/src/stores/monitorStore.ts`는 `USE_MOCK`이거나 `EventSource`가 없으면 SSE를 열지 않고, 초기 load와 `setInterval(reload, pollMs)` polling을 유지한다. `front/src/features/dashboard/hooks/useDashboard.ts`는 이 store의 `start`/`reload`/`dashboard`를 소비할 뿐 자체 stream을 열지 않는다. 이 fallback은 SSE reconnect 중에도 read-model을 다시 가져올 수 있게 하는 안전장치다.

### SSE frame별 frontend 처리

| SSE frame | backend 계약 | frontend 소비 |
| --- | --- | --- |
| `event: alert` | `id:`는 `alertSeq`, `data.alertSeq`는 stringified bigint | `addEventListener("alert", reload)`가 dashboard read-model을 다시 로드한다 |
| `event: alert-updated` | resolve lifecycle delta; SSE `id:` 없음 | `addEventListener("alert-updated", reload)`가 REST read-model reload로 누락 상태를 복구한다 |
| `event: session-invalid` | backend가 연결 시점 session을 재검증하다 만료·폐기·회전 등을 감지 | `monitorStore`가 stream을 닫고 `useAuthStore.getState().logout()`을 호출해 강제 로그아웃 상태로 전환한다 |
| `replay-error` | live 진입 전 진단용 오류 후 stream close | 전용 UI 분기는 없다. `onerror`에서 native reconnect와 polling fallback에 맡긴다 |

중요한 점은 프론트가 SSE payload를 직접 누적해 자체 SSOT를 만들지 않는다는 것이다. 이벤트를 “무언가 바뀌었다”는 invalidation signal로 보고 `dashboardService.getDashboard(facilityId)`를 다시 호출해 dashboard read-model을 seed/reload한다. reload 시드는 `GET /api/v1/alerts`와 시설/공간/거주자 read-model 계약에 맞물리며, 상세 wire 계약은 backend controller/DTO code, generated OpenAPI(`/api/docs`), endpoint mapper tests, `../rules/rest-api-convention.md`, and `../rules/dto-convention.md`가 소유한다.

`front/src/features/monitor/hooks/useRealtimeSpaceStatus.ts`는 monitor 화면의 상태 소비 hook이다. 이 hook은 `useMonitorStore.start(facilityId, refreshMs)`를 호출하고 `statuses`, `connection`, `lastUpdateAt`을 읽어 정렬된 공간 목록과 요약을 만든다. `front/src/stores/monitorStore.ts`는 EventSource(및 polling fallback)로 받은 `alert`/`alert-updated` frame을 `alertMerge`로 반영해 `statuses`, `connection`, `lastUpdateAt`을 갱신한다. `front/src/features/monitor/pages/FloorMonitorPage.tsx`는 이 hook 결과를 `MonitorHeader`와 `RoomStatusBoard`(status widget)들에 전달한다. 즉 monitor UI도 page가 직접 stream/protocol을 다루지 않고 hook/store seam을 통해 상태만 소비한다.

`front/src/features/monitor/hooks/useTTSAlerts.ts`는 `SpaceStatus`를 TTS 입력으로 변환하는 별도 side-effect seam이다. `front/src/features/monitor/pages/FloorMonitorPage.tsx`에서 `buildTTSAlerts(shownSpaces, statuses, floors)`로 주의/위험/응급 공간을 만들고 `useTTSAlerts(ttsAlerts, soundEnabled)`가 `front/src/features/monitor/services/tts/ttsManager.ts`에 동기화한다. 이 구조 덕분에 SSE/read-model 갱신, 화면 렌더링, 음성 알림 side effect가 서로 직접 결합하지 않는다.

## 4. 컴포넌트 구성과 재사용성

프론트 컴포넌트는 “작은 UI primitive → layout shell → 도메인 widget → page” 순서로 합성된다. 이 계층은 `front/AGENTS.md`의 “components never call backend directly” 규칙과 맞물려, 컴포넌트가 service/hook/type seam만 소비하게 만든다.

```text
`components/ui/` primitives
  → `components/layout/` route shells
  → domain components (`components/{monitor,staff,status,resident,poc}/`, shared root components)
    + feature-owned UI (`features/{dashboard,monitor,admin-events}/components/**`, 예: 영상 UI는 `features/admin-events/components/video/`)
  → `pages/**` + `features/*/pages/**` route-level composition
  → `router.tsx` + `RequireAuth` + `roles.ts` RBAC/default route
```

| 디렉터리/파일 | 재사용 책임 | 예시 |
| --- | --- | --- |
| `front/src/components/ui/` | 스타일 primitive와 입력 요소. backend/domain을 모른다 | `primitives.tsx`의 `Select`를 `features/dashboard/pages/DashboardPage.tsx` 필터에 사용 |
| `front/src/components/layout/` | route shell과 navigation chrome | `StaffLayout.tsx`는 직원 모드, `AppLayout.tsx`는 관리자 모드 children을 감싼다 |
| `front/src/components/monitor/` | 대형 현황판 전용 widget(공용 조각) | `AlertBanner` |
| `front/src/features/monitor/components/` | 대형 현황판 widget(feature-owned) | `MonitorHeader`, `RealtimeUpdateIndicator`, `ConnectionStatusBadge`, `FloorSelectCard`, `FloorSummaryStats`, `SoundToggle`, `FullscreenButton` |
| `front/src/components/status/` | 방 상태 보드 + 조치 패널(모니터·대시보드 공용) | `RoomStatusBoard`, `RoomStatusTreemap`, `RoomActionPanel` |
| `front/src/components/staff/` | 직원용 단순 배지 UI | `StaffStatusBadge` |
| `front/src/components/resident/` | 관심 어르신/배정 중심 UI | `FocusResidentSection` |
| `front/src/features/admin-events/components/video/` | 관리자 전용 event clip UI와 권한 표시 | `VideoPermissionGuard`, `AdminEventVideoPlayer`, `VideoAccessLogTable` |
| `front/src/pages/` | route-level composition과 page-local UI state(공용) | `LoginPage.tsx`, `pages/staff/AlertsPage.tsx`, `pages/admin/*`, `EventsPage.tsx` |
| `front/src/features/{dashboard,monitor,admin-events}/pages/` | feature-owned page composition | `DashboardPage.tsx`, `FloorMonitorPage.tsx`, `FloorSelectLandingPage.tsx`, `AdminEventDetailPage.tsx` |
| `front/src/hooks/` | page가 재사용하는 data/side-effect seam(공용) | `useActiveFacilityId` |
| `front/src/features/{dashboard,monitor}/hooks/` | feature-owned data/side-effect seam | `useDashboard`, `useRealtimeSpaceStatus`, `useTTSAlerts` |
| `front/src/types/index.ts` | PRD/API contract의 frontend type mirror | `Role`, `Space`, `SpaceStatus`, `DetectionEvent`, `DashboardResponse` 등 |
| `front/src/lib/` | pure formatting/label/role helper | `format.ts`, `labels.ts`, `alert.ts`, `roles.ts` |

이 구조에서는 page가 orchestration을 맡고 컴포넌트는 props로만 렌더링한다. 예를 들어 `front/src/features/monitor/pages/FloorMonitorPage.tsx`는 `dashboardService.getDashboard()`로 시설/층/공간 seed를 얻고, `useRealtimeSpaceStatus()`로 실시간 status projection을 읽은 뒤, domain component(`MonitorHeader`, `RoomStatusBoard`)에 `spaces`, `statuses`, `summary`, `connection`을 나눠 전달한다. `front/src/features/dashboard/pages/DashboardPage.tsx`도 `dashboardService.getDashboard()`를 호출하고 `StatsBar`, `FloorTabs`, `RoomStatusBoard`를 조합하지만, backend transport나 DTO parsing은 알지 않는다.

라우팅과 RBAC는 `front/src/router.tsx`, `front/src/lib/routeAccess.ts`, `front/src/lib/roles.ts`가 합성한다. `router.tsx`는 공개 route(`/login`, `/signup`, `/onboarding`), 시스템 대시보드(`/dashboard`), 시설 관리자 workbench(`/dashboard/facilities/:facilityId/admin`), 시설 직원 workbench(`/dashboard/facilities/:facilityId/staff`), monitor route(`/monitor/:facilityId`, `/monitor/:facilityId/floors/:floorId`)를 분리한다. 보호 route는 `RouterBootstrap`과 `RequireAuth`로 감싸고, 관리자 shell은 `RequireAuth minRole="ADMIN"`로 제한한다. `routeAccess.ts`는 기본 경로와 facility-scoped path builder를, `roles.ts`는 사용자-facing role label과 permission helper를 `SUPER_ADMIN | ADMIN | STAFF` 계약에서 직접 읽히게 둔다.

## 5. 핵심 흐름 다이어그램

### Backend push → hook/store → component

```text
backend `GET /api/v1/dashboard/stream`
  ├─ `event: alert` (`id` = alertSeq)
  ├─ `event: alert-updated`
  └─ `event: session-invalid`
        │
        ▼
`front/src/features/dashboard/hooks/useDashboard.ts`
  ├─ alert/update → `reload()`
  │     ▼
  │   `dashboardService.getDashboard(facilityId)`
  │     ▼
  │   dashboard read-model seed/reload (alerts, spaces/floors)
  │     ▼
  │   page state / hook projection
  │     ▼
  │   `DashboardPage`, `FloorMonitorPage`, monitor/staff widgets
  └─ session-invalid → close EventSource → `useAuthStore.logout()`
```

### User action → service → apiClient → backend

```text
button/form/page effect
  │
  ▼
page or component handler
  │
  ▼
service (`authService`, `eventService`, `adminService`, `videoService`)
  │
  ▼
endpoint mapper when wired (`front/src/services/api/*`)
  │
  ▼
`requestJson` / `requestNoContent`
  ├─ `buildApiUrl(path)` with `VITE_API_BASE_URL=/api/v1`
  └─ `credentials: "include"` in real backend mode
        │
        ▼
backend controller/service/repository
```

## References

- [전체 시스템 아키텍처](../architecture.md)
- [Backend Architecture](./backend.md)
- [Realtime SSE convention](../rules/realtime-sse-convention.md)
- [REST API convention](../rules/rest-api-convention.md)
- [DTO convention](../rules/dto-convention.md)
- ADR
- ADR
- ADR
