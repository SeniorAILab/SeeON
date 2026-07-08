# ML Dashboard 2-Mode Redesign (관제 / 엔지니어 QA)

This is the approved UX plan for the 관제/엔지니어 redesign. `DESIGN.md` owns the
token system; this document does not redefine or override it.

Grounded in `ml/dashboard/DESIGN.md` tokens and the current component
tree (`ml/dashboard/src/components/*`, `ml/dashboard/src/api/*`,
`ml/dashboard/src/statusFeed.ts`). No real camera/network details used.

## 0. Key findings that shape this design

- `cameraEventLogic.ts::buildEventOptions` already derives event types from
  `camera.domains` (dynamic registry) plus live events/clips — this is the right
  base to build on, it must not be replaced.
- `EventLivePanel.tsx` renders one `<img src={streamUrl}>` per mount. Today
  `getCameraStreamUrl(cameraId)` takes no event-type argument, so the "event
  selector" in the current UI is cosmetic (it filters clip history, but every
  event button shows the *same* MJPEG feed). Isolating a single detector's
  overlay for 엔지니어 모드 requires a new query param on the stream endpoint.
- `ml/api/routes/streams.py::camera_stream` is a raw passthrough to the worker's
  `/stream/{camera_id}` — one HTTP connection held open for the lifetime of the
  `<img>` element. This confirms the "1 concurrent live stream" cap must be
  enforced client-side (never mount a second `<img>` against this endpoint).
- `Camera` (api/types.ts) carries `space_id` but no human-readable floor/room
  label. Backend `Space` (prisma) has `floorId` + `name`, so floor/room grouping
  is backed by real data model — it just isn't surfaced through `/cameras` yet.
  This is called out as an API gap below, not assumed away.
- `statusFeed.ts::collectEvents` hard-caps at 12 events total. The ops feed rail
  needs a slightly deeper buffer; flagged as a small modification.

## 1. IA / Navigation model

Two top-level **personas**, entered via primary nav items — not a modal
toggle, not a query param, not a role system (there's a single shared relay
token, no per-user auth). `DashboardShell`'s `ScreenId` union changes from
`'home' | 'cameras' | 'events' | 'system' | 'settings'` to:

```
'ops' | 'engineer' | 'cameras' | 'system' | 'settings'
```

- **관제 (`ops`)** replaces `home` + `events`. It is the default landing
  screen — this is the primary persona per DESIGN.md's "quiet edge operations
  console" framing.
- **엔지니어 QA (`engineer`)** is the refined `CameraEventWorkspace`.
- `cameras` / `system` / `settings` are unchanged, persona-agnostic config
  screens. In the sidebar they render below a visual divider (secondary tier)
  so the two live-operation modes read as the primary choice.

Within **관제**, there are two sub-states, not separate nav entries:

- **Wall** (default): event feed rail + paginated camera wall, grouped by
  room/floor.
- **Focused**: one camera, live, all its registered overlays on. Entered by
  clicking an event in the feed rail or a tile in the wall. Exited via an
  explicit "← 카메라 월로 복귀" control. This is local component state
  (`focusedCameraId: string | null`), not routed — deep-linking can come later
  if needed.

Mode switching is also the mechanism that guarantees the "1 concurrent MJPEG
stream" rule: leaving `ops` unmounts the focused `<img>` (if any); leaving
`engineer` unmounts its `<img>`. Only one of the two screens is mounted at a
time (`App.tsx` already does `{screen === X ? ... : null}` conditional
rendering), so this falls out of existing structure rather than needing new
bookkeeping.

## 2. ASCII wireframes

### 2.1 관제 · Wall (default)

```
┌ 엣지 카메라 대시보드 ─────────────────────────────────────────────────┐
│ [E]  관제 · 엔지니어 QA        카메라 관리 · 시스템 · 탐지 설정   ● 연결됨│
├───────────────┬─────────────────────────────────────────────────────┤
│ 실시간 이벤트   │  카메라 월 · 12 / 50               [1][2][3][4] 다음 >│
│ (다크 서피스)   │                                                     │
│ ────────────  │  ┌ 2F · 병동A (4) ┐   ┌ 2F · 병동B (4) ┐            │
│ ● 낙상         │  │ [ ][ ][ ][ ]   │   │ [ ][ ][ ][ ]   │            │
│  3F-302 · 12초 │  └────────────────┘   └────────────────┘            │
│ ○ 침대 이탈     │  ┌ 3F · 병동A (4) ┐                                 │
│  2F-210 · 41초 │  │ [ ][ ][ ][ ]   │   각 타일 = 스냅샷(폴링) +       │
│ ○ 침대 이탈     │  └────────────────┘   상태 뱃지 + 최근 이벤트 배지   │
│  2F-107 · 2분  │                                                     │
│  ...(스크롤)   │  타일/이벤트 클릭 → 포커스 뷰로 전환                  │
└───────────────┴─────────────────────────────────────────────────────┘
```

- Feed rail keeps the existing dark live-surface treatment; wall tiles reuse
  the `min-h-24` tile pattern from the current camera grid, but the image is a
  polled JPEG, not a live connection.
- Pagination + grouping headers live in the wall, not the rail (rail is a flat
  recency-ordered list — grouping the rail by room would fight its purpose,
  which is "what needs attention right now").

### 2.2 관제 · Focused

```
┌ 관제 · 포커스 ─────────────────────────────────────────────────────┐
│ ← 카메라 월로 복귀        3F-302 · 낙상 감지 · 침대 이탈 감지 등록됨 │
├───────────────┬───────────────────────────────────────────────────┤
│ 실시간 이벤트   │        ┌───────────────────────────────────┐     │
│ (동일하게 유지) │        │                                   │     │
│                │        │   LIVE MJPEG — overlay: all       │     │
│                │        │   (등록된 모든 이벤트 레이어 표시)  │     │
│                │        └───────────────────────────────────┘     │
│                │        클립 이력 · 이 카메라의 전체 이벤트         │
└───────────────┴───────────────────────────────────────────────────┘
```

- Rail stays mounted and live so the operator can jump to the next alert
  without losing situational awareness — only the wall is swapped out.
- This view is a modified `CameraEventLivePanel` (already: single camera +
  live stream + evidence clips), changed to request *all* overlays rather than
  one event's overlay, and to accept focus-by-tile-click as well as
  focus-by-event-click.

### 2.3 엔지니어 QA

```
┌ 엔지니어 QA ───────────────────────────────────────────────────────┐
│ 카메라 선택  [cam-01][cam-02][cam-03] ... (기존 그리드 그대로)       │
│ ┌─────────────────────────────────┐  QA 메타데이터                 │
│ │ 이벤트: [침대 이탈] [낙상]        │  스트림 fps: 8.2               │
│ │                                 │  최근 이벤트: 12초 전            │
│ │   LIVE MJPEG — overlay:         │  worker 상태: READY             │
│ │   선택한 이벤트 1개만            │  (정보 없으면 "정보 없음" 표시,  │
│ └─────────────────────────────────┘   가짜 값 금지)                │
│ 클립 이력 · 선택 카메라 × 선택 이벤트                                │
└─────────────────────────────────────────────────────────────────┘
```

- This is today's `CameraEventWorkspace` almost unchanged in structure (camera
  grid → event selector → stream → clip history) with one behavior change
  (event selector now actually swaps the overlay, via the new query param)
  and one addition (QA metadata strip).

## 3. Component inventory

| Component / file | Status | Notes |
| --- | --- | --- |
| `DashboardShell.tsx` | **Modified** | `ScreenId` becomes `'ops'\|'engineer'\|'cameras'\|'system'\|'settings'`; nav renders primary tier (관제/엔지니어 QA) + secondary tier (카메라 관리/시스템/탐지 설정) with a divider; default screen `'ops'`. |
| `cameraEventLogic.ts` | **Modified** | Keep `buildEventOptions`/`eventLabel`/`normalizeEventTypeName` as the single source of registry truth (do not fork it). Add a helper to build the "all overlay types for this camera" list (already derivable from the same `camera.domains` map). |
| `EventLivePanel.tsx` | **Modified** | Add an `overlayMode: 'single' | 'all'` prop that changes the stream URL built (see API section). Keep existing empty/error/unavailable states verbatim — no sample-video fallback stays enforced here. |
| `CameraEventLivePanel.tsx` | **Modified → becomes `FocusedCameraPanel.tsx`** | Rename/refine: accept focus source from either an event click or a tile click; pass `overlayMode="all"`; add the "← 카메라 월로 복귀" control. |
| `CameraEventWorkspace.tsx` | **Modified → `EngineerWorkspace.tsx`** | Same camera+event selector skeleton; pass `overlayMode="single"`; mount new `QAMetadataStrip`. |
| `ClipLabelButtons.tsx`, `StatusBadge.tsx`, `AuthGate.tsx` | **Reuse as-is** | Token gate and truth-labeling are explicit "keep" requirements; no changes needed. |
| `CameraCard.tsx`, `CameraManagementPanel.tsx`, `AddCameraModal.tsx`, `DeleteCameraDialog.tsx`, `DetectionSettingsForm.tsx`, `SystemPanels.tsx` | **Reuse as-is** | Registry/settings/system screens are persona-agnostic; untouched by this redesign. |
| `EventFeedRail.tsx` | **New** | Live-updating event list (recency order), click → sets `focusedCameraId`. Reuses `FeedEvent` type from `statusFeed.ts` and `eventLabel`/`formatEventTime` from `cameraEventLogic.ts`. |
| `CameraWallGrid.tsx` | **New** | Groups `cameras` by floor/room label, paginates, renders `CameraSnapshotTile` per camera. |
| `CameraSnapshotTile.tsx` | **New** | One tile: polled JPEG `<img>`, status badge (reuses `StatusBadge`), latest-event badge, click → focus. Explicit unavailable state, no placeholder image. |
| `useSnapshotPolling.ts` | **New hook** | Per-tile interval with jitter, pauses when tile is unmounted/off-page, routes actual fetches through the shared queue below. |
| `snapshotQueue.ts` | **New util** | Small concurrency-limited fetch queue (see numeric limits) shared by every mounted tile so the wall never exceeds the browser's per-host connection ceiling. |
| `QAMetadataStrip.tsx` | **New** | Shows stream fps / last-event time / worker readiness for the selected camera in 엔지니어 모드; renders "정보 없음" per field when the backing data isn't available — never fabricates a value. |
| `roomGrouping.ts` | **New util** | Groups cameras by floor/room label for the wall; degrades to a single "미분류" group if the label is absent (see API gap below). |
| `OpsWorkspace.tsx` | **New container** | Composes `EventFeedRail` + `CameraWallGrid` + `FocusedCameraPanel`, owns `focusedCameraId` state, mounted at `screen === 'ops'`. |

## 4. Data / API needs

1. **New snapshot endpoint** — `GET /api/v1/streams/{camera_id}/snapshot`
   - Single JPEG response (not multipart), same auth as the existing stream
     route (`Authorization: Bearer` or `?token=`), same relay-token gate.
   - `ml-api` proxies to a worker-side single-frame endpoint (new on the
     worker; out of scope for the frontend PRs, tracked as a cross-package
     dependency).
   - Frontend: `getCameraSnapshotUrl(cameraId)` added next to
     `getCameraStreamUrl` in `api/session.ts`, following the same masked-token
     pattern.

2. **Overlay selection on the live stream** — extend
   `GET /streams/{camera_id}` with an optional `overlay` query param:
   `?overlay=<event_type>` for a single detector's layer (엔지니어 모드),
   omitted or `overlay=all` for every registered layer composited (관제
   focused view). This changes `ml/api/routes/streams.py::_stream_url` to
   forward the param to the worker, and requires the worker to support
   selective overlay compositing — flagged as a **cross-package contract**,
   not something the frontend PRs can land alone. `getCameraStreamUrl` gets an
   optional second argument for this.

3. **Floor/room label on `Camera`** — `/cameras` needs to surface a
   human-readable grouping label (e.g. `space_label` / `floor_label`) sourced
   from backend `Space.floorId` + `Space.name`, not just the opaque
   `space_id` already present. Until this lands, `roomGrouping.ts` groups
   everything into one "미분류" bucket rather than guessing — explicit gap,
   not silently faked.

4. **QA metadata** — `fps` / `last_event_at` / worker-readiness per camera
   aren't in today's `SystemSnapshot` or `/status` shape.
   `extractCameraRuntimeStatuses` in `statusFeed.ts` already gives an
   online/offline/starting/unknown signal per camera and can back the
   "worker 상태" field now; `fps` and precise "최근 이벤트" timestamp need a
   small `/system` or `/status` payload addition. Until available,
   `QAMetadataStrip` shows "정보 없음" for the missing fields — consistent
   with "no sample-video fallback ever."

5. **`statusFeed.ts` event cap** — raise `collectEvents`'s hard cap from 12
   to ~30 so the ops feed rail has enough buffer to scroll a meaningful
   history; the rail itself can still visually truncate to the top ~15.

## 5. Numeric limits

| Limit | Value | Why |
| --- | --- | --- |
| Snapshot poll interval | **5s default** (facility-tunable 5–10s) | At 50 cameras / 5s that's 10 req/s; at a modest thumbnail JPEG size that's low-single-digit-Mbps sustained — comfortable headroom under the 100Mbps LAN shared with worker ingestion. The interval isn't the binding constraint — see next row. |
| Snapshot fetch concurrency | **6 in-flight, queued beyond that** | Matches the browser's ~6 connections-per-host ceiling for HTTP/1.1. A naive "50 independent `setInterval`s" design would try to open 50 requests at once and starve every other API call on the page (event feed poll, clip fetch). `snapshotQueue.ts` enforces this regardless of chosen interval; with only the active page's tiles polling (≤ pagination size), 6-way concurrency clears a full page in a few hundred ms, well inside the 5s window. |
| Poll jitter | **±20% of interval, per tile** | Staggers requests so 12–16 tiles don't all fire in lockstep every interval tick. |
| Max concurrent live MJPEG streams | **1, app-wide** | Enforced structurally: only one of `ops`(focused) / `engineer` is mounted at a time, and within `ops`, focusing a camera unmounts the wall (which is what stops its snapshot polling) before the focused `<img>` mounts. Never render two `<img src=.../streams/...>` elements simultaneously. |
| Wall pagination size | **12 tiles/page (e.g. 4×3)** | Bounds simultaneous polling to the concurrency budget above and keeps tile density readable against the existing `min-h-24` tile spec; room/floor groups paginate within this overall cap when a facility has more cameras than fit one page. |
| Event feed rail depth | **buffer 30 / display top 15** | Matches the `statusFeed.ts` cap raise; rail scrolls past 15 rather than growing unbounded. |

## 6. PR decomposition (small, reviewable, per AGENTS.md package split)

1. **ml-api**: add `GET /streams/{camera_id}/snapshot` (worker-dependent;
   coordinate contract, land ml-api side against a stub/feature-flagged
   worker route if the worker PR lags).
2. **front (api layer only, no UI change)**: `getCameraSnapshotUrl`,
   `overlay` param on `getCameraStreamUrl`, `Camera` type gap fields
   (`space_label`/`floor_label`, QA fields as optional), `statusFeed.ts` cap
   bump. Fully covered by unit tests, no visual diff.
3. **front (wall, read-only)**: `snapshotQueue.ts`, `useSnapshotPolling.ts`,
   `CameraSnapshotTile.tsx`, `roomGrouping.ts`, `CameraWallGrid.tsx`, wired
   into a page behind the current nav (no feed rail yet, no focus yet) so it
   ships and is reviewable standalone.
4. **front (ops assembly)**: `EventFeedRail.tsx`, `FocusedCameraPanel.tsx`
   (renamed/refined `CameraEventLivePanel`), `OpsWorkspace.tsx`,
   `DashboardShell.tsx` nav restructure — this PR is where 관제 모드 becomes
   real end-to-end.
5. **front (engineer refinement)**: `CameraEventWorkspace.tsx` →
   `EngineerWorkspace.tsx` rename + `overlayMode="single"` wiring +
   `QAMetadataStrip.tsx`.
6. **ml-api + ml-worker (cross-package)**: overlay-filter contract on the
   stream endpoint, tracked via an ADR if the worker-side compositing change
   is nontrivial — this can land after PR4/5 ship with `overlay=all` as the
   only supported value in the interim (focused view still works; engineer
   single-overlay isolation arrives with this PR).
