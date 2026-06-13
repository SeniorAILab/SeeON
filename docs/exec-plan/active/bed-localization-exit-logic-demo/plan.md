# Plan: 침대 이탈 탐지 (Bed-Exit Detection) — ML demo

> **Status:** pending approval
> **Mode:** omc-plan `--consensus --direct` (RALPLAN-DR short)
> **Issue:** #100 · branch `feat/100-feat-ml-bed-localization-exit-logic-demo`
> **Worktree:** `/Users/<user>/Documents/01_Project/eldercare-fall-ai-worktrees/feat/100-feat-ml-bed-localization-exit-logic-demo`
> **Spec:** `.omc/specs/deep-interview-bed-exit-detection.md` (ambiguity ~5%, PASSED)
> **Research:** `docs/research/bed-exit-detection-criteria.md`

## Requirements Summary

Add post-exit bed-leaving detection to the ML demo. A bed is static, so detect it **once** at
stream/playback start with a COCO detection model (`yolo26n.pt`, `bed` = class 59) and cache the
ROI; every subsequent frame keeps the **single YOLO26-pose pass** (user's core "one pass, no
duplication" intuition). Exit is judged per-track via a containment ratio against the cached bed
ROI, with a ~1s dwell debounce, using the existing `GreedyIouTracker` for multi-person handling
(per-track in-bed→out transition — caregivers who were never in bed never fire). A new Streamlit
page hosts this (fall detection stays on its existing page). Night-mode is an operator toggle. A
scene with no bed is a graceful normal state, not an error.

## RALPLAN-DR Summary

### Principles
1. **One pass per frame** — bed is static; detect once + cache, never re-detect per frame (honors ADR-005 §3 model-seam single-pose-pass).
2. **No fabrication** — only real inference boxes/keypoints/labels are surfaced; latch aggregates real signal only (ADR-005 §5).
3. **Reuse before adding** — extend `DetectionResult`, reuse `GreedyIouTracker`, `render_yolo_overlay`, the `FallEventLatch` pattern, and the `live_camera.py` page template rather than inventing parallel infra.
4. **Graceful degradation** — "no bed" and "night-mode off" are first-class normal states (monitor-only), never exceptions.
5. **Pure-function core** — exit logic is a deterministic pure function over (tracks, bedROI, params) so it is unit-testable without Streamlit/YOLO.

### Decision Drivers (top 3)
1. **Avoid duplicate per-frame work / cost** → cache static bed ROI; one-shot detection.
2. **False-alarm robustness in multi-occupant nursing homes** → per-track in-bed→out transition + 1s dwell (research: single-frame triggers cause systematic false alarms; 1s debounce is the peer-reviewed default).
3. **Separation of concerns / reversibility** → bed-exit on a new page + new module behind the `ModelModule` seam, so fall path is untouched and bed-exit is independently removable.

### Viable Options (bed-localization strategy — the load-bearing choice)
- **Option A (CHOSEN): Separate one-shot COCO detection runner + cache.** A `YoloBedRunner`
  (mirrors `YoloPoseRunner`) calls a COCO-det weight once at start; highest-conf `bed` box cached
  into `DetectionResult.bed_box`.
  - *Pros:* honors one-pass-per-frame (detection runs once, not per frame); pose path untouched;
    clean seam; "no bed" falls out naturally (empty detection → `bed_box=None`).
  - *Cons:* a second model weight to download/cache (~one-time); first-frame latency for the
    detection call.
- **Option B: Re-detect bed every frame with the det model.** Rejected — doubles per-frame model
  calls, violates Principle 1 and the user's explicit intuition; no benefit since the bed is static.
- **Option C: Manual operator ROI drawing / multimodal screen-capture.** Rejected for this work —
  spec marks it a deferred non-goal; adds UI complexity with no detection benefit for the common case.

*Invalidation rationale:* B is strictly dominated by A (same accuracy, 2× cost). C solves a
different problem (no COCO bed class available / odd furniture) and is explicitly deferred.

### Viable Options (exit-trigger criterion)
- **CHOSEN: containment ratio `area(person∩bed)/area(person) < 0.1` sustained ~1s, per in-bed track.**
  Research confirmed (a) skeleton/ROI geometric criteria over raw pixels, (b) 1s dwell as the
  peer-reviewed default (PMC9332029), (c) single-frame triggers cause false alarms, (d) centroid
  displacement was actively refuted. Containment (vs centroid / ankle-only) is the surviving
  ROI-overlap formulation.
- *Rejected:* centroid-leaves-ROI (refuted by research); ankle-keypoint-crossing (no confirmed
  standalone validation; brittle under blanket occlusion); IoU (penalizes large person boxes vs a
  small bed box — containment normalizes by person area instead).

## Acceptance Criteria (from spec AC-1..17)

**Bed localization**
- AC-1: At stream/playback start, run COCO det model (`yolo26n.pt`) once, cache highest-conf `bed` (class 59) box as ROI.
- AC-2: Subsequent frames call the pose model only (no per-frame detection — single pose pass preserved).
- AC-3: No bed detected → graceful "침대 없음" state (no exception), exit-judgment disabled, pose overlay continues.

**Bed-exit logic**
- AC-4: Per track i, `containment = area(person_box_i ∩ bedROI) / area(person_box_i)`.
- AC-5: Track with containment ≥ in-bed threshold (default 0.5) sustained → marked "in-bed".
- AC-6: An "in-bed" track whose containment drops below exit threshold (default 0.1) for ~1s (`round(fps×1.0)` frames) fires a bed-exit event for that track.
- AC-7: A track never in-bed (e.g. caregiver) never fires, regardless of ROI movement.
- AC-8: Night-mode toggle OFF → no exit event fired (monitor only).
- AC-9: Exit latch fires on rising edge only; never fabricates/extends real inference (ADR-005 §5).

**Demo page**
- AC-10: New page under `ml/demo/pages/` follows `live_camera.py` bootstrap / `set_page_config` convention.
- AC-11: Cached bed ROI drawn as overlay on the frame.
- AC-12: Reuses existing `render_yolo_overlay` (person box / skeleton toggles).
- AC-13: On exit event, 🚨 latch badge (first time + count) shown (FallEventLatch pattern).
- AC-14: Supports both uploaded video and live camera; exposes "야간 모드" toggle and "침대 없음" info badge.

**Test**
- AC-15: Exit-logic unit tests — containment math, in-bed→out transition, ~1s dwell, multi-track separation (caregiver non-fire), "no bed" state — as pure functions.
- AC-16: Bed detection/cache unit test — detect-once + cache, graceful entry on no-detection (model stubbed/fixture).
- AC-17: Page-control smoke — night-mode / overlay toggles / latch badge (pattern of `test_demo_app_controls.py`, `FALL_DEMO_MODE=operator`).

## Implementation Steps (with file references)

All paths under the worktree `ml/`. Suggested order = dependency order; each step is independently testable.

### Step 1 — Extend the seam: `DetectionResult.bed_box`
- **File:** `ml/demo/seam.py` (`DetectionResult`, lines 45–51; `frozen=True, slots=True`).
- Add a 4th keyword field with default: `bed_box: BoundingBox | None = None`. All callers
  construct by keyword, so no call-site breakage.
- If exported as a standalone concept, add to `__all__` (line ~20).
- **Test touchpoint:** existing seam users keep working (defaults).

### Step 2 — COCO bed detection runner + one-shot detector (first-frame protocol)
- **New runner** `ml/demo/yolo_runtime.py`: add `YoloBedRunner` mirroring `YoloPoseRunner`
  (class 12–66) but reading `r.boxes` only (no keypoints), filtering to COCO class 59 (`bed`),
  returning the highest-confidence box. Reuse `_load_yolo_model` (lines 69–72).
- **Weight name (must-fix #4):** COCO-det weight pinned to `yolo26n.pt`, matching the existing pose
  weight family `yolo26n-pose.pt` (`yolo_runtime.py:15`); auto-downloaded by ultralytics on first
  `YOLO(path)`, cached in new `ml/models/bed/` dir, gitignored (never commit `*.pt`). At
  implementation, **assert the model's `names` maps index 59 → `"bed"`** before trusting the class id
  (guards against a weight-family rename); fail into graceful "no bed" if not.
- **New one-shot detector** `ml/demo/bed_detector.py`: `BedDetector.detect(frame: Frame) -> BoundingBox | None`
  runs the runner on **one** frame and returns the highest-conf bed box (or `None`). It is stateless
  per call; caching is the page's job (Step 6). Empty detection → `None` ⇒ AC-3 graceful "no bed".
- **First-frame protocol (must-fix #2):** `VideoFileSource`/`CameraSource` are forward-only iterators
  (`seam.py:6` re-exports from `util.frame_source`); peeking a frame consumes it. Resolve by having
  the page read the first frame once (`first = next(frame_iter)`), call `BedDetector.detect(first)`,
  then run the main loop over **`itertools.chain([first], frame_iter)`** so no frame is dropped.
  Document this explicitly in Step 6; the detector itself never owns the source.
- **Test:** AC-16 — stub the runner (MagicMock per `test_demo_classifier_module.py`); assert detect
  runs on the seed frame once and returns the cached box; empty detection → `None` graceful path.

### Step 3 — Bed-exit logic as a pure function + `BedExitModule`
- **New pure module** `ml/demo/bed_exit.py`:
  - `containment(person_box, bed_box) -> float` = intersection-area / person-area (AC-4).
  - A `BedExitTracker`/state object keyed by `track_id` holding `in_bed: bool`,
    `in_streak_frames: int`, `out_streak_frames: int`; pure
    `update(track_ids, boxes, bed_box, fps, params) -> dict[track_id, ExitState]`
    implementing AC-5 (in-bed latch at ≥0.5), AC-6 (exit when <0.1 for `round(fps×1.0)` frames),
    AC-7 (never-in-bed never fires).
  - **Symmetric entry dwell (must-fix #8):** AC-5's "in-bed" transition must require containment ≥
    `bed_in_threshold` sustained `round(fps × bed_in_dwell_sec)` frames (`in_streak_frames`), NOT a
    single frame. Otherwise a one-frame flicker above 0.5 sets `in_bed=True` and can fire a false
    exit on the very next frame. Add an `in_streak_frames`-flicker unit test.
  - **Track eviction (must-fix #5):** `update()` MUST drop per-track state for `track_id`s no longer
    present in the live set (compare incoming `track_ids` against the prior frame's keys, or accept
    `GreedyIouTracker.live_ids` and prune the dict). Without this, a track that disappears and
    reappears under a new id silently accumulates stale `in_bed`/`out_streak` state. Add an
    explicit unit test for evict-then-reappear.
  - No Streamlit/YOLO imports — pure, fully unit-testable (AC-15).
- **`BedExitParams` (must-fix #3):** a **separate** `@dataclass(frozen=True, slots=True)` in
  `ml/demo/bed_exit.py` — `bed_in_threshold: float = 0.5`, `bed_exit_threshold: float = 0.1`,
  `bed_in_dwell_sec: float = 0.5`, `bed_exit_dwell_sec: float = 1.0`. Do **NOT** extend `ClassifierParams` (`classifiers.py` lines
  19–26): those flow into `select_classifier_params()` (`demo_ui.py` lines 123–140) which renders on
  the **fall** page (`app.py`), leaking bed sliders onto the wrong page. Bed-exit sliders, if added,
  live in a bed-exit-only expander on the new page (Step 8).
- **`BedExitModule`** (new file `ml/demo/bed_exit_module.py`) implementing the `ModelModule` protocol
  (`seam.py` lines 53–55): composes the pose module (pattern of `TemporalFallClassifierModule`,
  `temporal_module.py` lines 143–291), accepts the already-cached `bed_box` (from Step 2) at
  construction, calls `self._tracker.update(pose.boxes)` (`GreedyIouTracker.update`, `tracking.py`
  lines 74–138 — returns track-aligned IDs), runs `bed_exit` logic, and returns a `DetectionResult`
  with `bed_box` set and per-track exit state encoded in `labels` using a **dedicated label text
  (e.g. `"BED_EXIT"`) with `is_fall=False`** so it never contaminates the fall path
  (`playback_status.py:25` derives `is_fall` from labels).
- **Test:** AC-15 (pure-function suite per `test_demo_tracking.py` style — `_box()` helpers, no fixtures).

### Step 4 — `BedExitLatch` (rising-edge, UI-only)
- **File:** mirror `FallEventLatch` (`ml/demo/live_view.py` lines 32–57) — either add `BedExitLatch`
  there or a new `ml/demo/bed_exit_latch.py`. Fields `event_count`, `first_event_sec`, `_prev_exited`;
  `update(is_exited: bool, time_sec: float) -> bool` fires True on rising edge only (AC-9, AC-13).
  Aggregation of real signal only — no fabrication.
- **Test:** AC-15 latch test mirroring `TestFallEventLatch` (`test_live_view.py` lines 103–129).

### Step 5 — Overlay: draw the bed ROI
- **File:** `ml/demo/yolo_overlay.py` (`render_yolo_overlay`, lines 38–57). Add
  `show_bed_box: bool = True` param + `_draw_bed_box(overlay, bed_box)` helper reading
  `result.bed_box`; neutral color (e.g. yellow `(255,200,0)`) distinct from person boxes (AC-11).
  Reuse existing person-box/skeleton drawing unchanged (AC-12).
- **Test:** extend `test_demo_yolo_overlay.py` (np.zeros frame, assert ndarray shape/pixel change).

### Step 6 — New Streamlit page (own loop — does NOT use `iter_live_frames`)
- **New file** `ml/demo/pages/bed_exit.py` — uses `pages/live_camera.py` (113 lines) only as a
  **bootstrap/layout** template, not its loop:
  - bootstrap `sys.path.insert(...)` (lines 1–8), `st.set_page_config(page_title="침대 이탈", layout="wide")`.
  - source selector supporting **both** upload (`VideoFileSource` — `live_camera` only had
    `CameraSource`) and live camera (`CameraSource(index)`); reuse `render_live_controls()`. Bed-exit
    thresholds via a dedicated `BedExitParams` expander on **this page only** (must-fix #3) — NOT
    `select_classifier_params()`.
  - **"야간 모드" toggle** (`st.toggle`) gating exit firing (AC-8); **"침대 없음" info badge** when
    cached `bed_box is None` (AC-3/AC-14).
  - **Model wiring (must-fix #6):** construct `YoloPoseModule(...)` then wrap directly in
    `BedExitModule(pose_module=..., bed_box=cached, params=BedExitParams())`. Do **NOT** call
    `demo_ui.build_model` — it only builds pose + fall and has no `BedExitModule` path.
  - **One-shot bed detect (must-fix #2):** `first = next(frame_iter)`; `bed_box =
    BedDetector(...).detect(first)`; render the "침대 없음" badge immediately if `None`.
  - **Own frame loop (must-fix #1, #7):** iterate
    `for frame in itertools.chain([first], frame_iter):` — call `result = bed_exit_module.predict(frame)`
    directly, `overlay = render_yolo_overlay(frame.image, result, show_bed_box=True, ...)`,
    `frame_ph.image(overlay)`. Read exit state **from `result` directly** (the `"BED_EXIT"` labels),
    NOT via `current_playback_status()`. On rising-edge `bed_latch.update(is_exit, t)` (gated by
    night-mode toggle), render `🚨 침대 이탈 {count}회 — 최초 {first:.1f}초` on a dedicated
    `st.empty()` (badge pattern mirrors `app.py` lines 177–181). `iter_live_frames`,
    `CurrentPlaybackStatus`, `app.py`, and `live_camera.py` are **untouched**.
- **Test:** AC-17 page-control smoke per `test_demo_app_controls.py`, `FALL_DEMO_MODE=operator`.

### Step 7 — `iter_live_frames` / shared infra: explicitly NO change (must-fix #7)
- **Do not touch** `ml/demo/live_view.py` `iter_live_frames` (lines 60–98), its `(overlay, status,
  confidence)` yield tuple, `playback_status.py`, `app.py`, or `pages/live_camera.py`. Because the
  bed-exit page runs its own loop (Step 6), there is no need to thread exit state through the shared
  live-loop or `CurrentPlaybackStatus` (which has no `is_bed_exit` field — `playback_status.py`
  lines 11–16). The fall path is provably unaffected.

### Step 8 — Bed-exit params UI (page-scoped only)
- **File:** `ml/demo/pages/bed_exit.py` — a dedicated `st.expander` with sliders for
  `BedExitParams` (in/exit thresholds, entry/exit dwell). Defaults are safe; sliders are optional.
  These live ONLY on the bed-exit page — never in `select_classifier_params()` (must-fix #3).

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Tuple-shape change to `iter_live_frames` breaks `app.py` + `live_camera.py` callers | Step 7 default is **additive** (carry state in `DetectionResult`); change tuple only if forced, and update both unpack sites in the same commit. |
| Second model download (`yolo26n.pt`) inflates first-frame latency / cold start | One-shot at start with a spinner; cache in `ml/models/bed/`; reuse ultralytics auto-download (same path as pose). Document in page. |
| Containment threshold mis-tuned → false/missed exits under oblique angle / blanket occlusion | Research notes this is empirically unresolved → ship as tunable `ClassifierParams` with researched defaults (1s dwell, <0.1 exit), expose sliders (Step 8); label as best-effort. |
| `frozen=True, slots=True` on `DetectionResult` rejects new field | Field added with default at class def (Step 1); slots regenerate at class creation — verified all callers construct by keyword. |
| Committing weights | `*.pt` already gitignored; `ml/models/bed/` gitignored like `ml/models/pose/`. CI deny-assets guard (`scripts/git-guard/deny-assets`) catches accidental adds. |
| Public-mode invariant leak (nursing-home footage) | Keep `FALL_DEMO_MODE=public` default + session upload scope (streamlit-demo.md §4·5); page adds no new persistence. |
| Caregiver false-alarm | Per-track in-bed→out rule (AC-7) — only tracks that were in-bed can fire. |
| Late-appearing bed (camera pans to bed after frame 1) → `bed_box=None` cached for whole session, no recovery | **Accepted limitation, documented:** one-shot detect uses the first frame only; bed that enters later stays "침대 없음". A re-detect button is a deferred follow-up. State this in the page help text. |
| `BedExitLatch` resets on Streamlit rerun (widget interaction) → `event_count` reverts to 0 | **Accepted, same as the fall page:** latch is per-page-load; no session-state persistence is attempted (matches `app.py` `FallEventLatch` behavior). Document the accepted parity. |
| In-bed single-frame flicker → immediate false exit | Symmetric entry dwell `bed_in_dwell_sec` (Step 3, must-fix #8). |

## Verification Steps

1. **Unit (pure):** `cd ml && uv run pytest tests/test_bed_exit*.py -q` — containment math, in-bed→out transition, 1s dwell at multiple fps, multi-track caregiver non-fire, no-bed state (AC-4..8, AC-15).
2. **Unit (detect/cache):** stubbed runner — detect-once asserted, no-detection → graceful (AC-1..3, AC-16).
3. **Unit (latch):** rising-edge-only, count/first-time (AC-9).
4. **Unit (overlay):** `test_demo_yolo_overlay.py` extension — bed box drawn, ndarray valid (AC-11/12).
5. **Smoke:** `test_demo_app_controls.py`-style — page imports, toggles present, latch badge wiring, `FALL_DEMO_MODE=operator` (AC-10, AC-13, AC-14, AC-17).
6. **Full suite + lint:** `cd ml && uv run pytest -q` green; project lint clean. No `*.pt` staged (`git status`).
7. **Manual (operator):** run demo, open new page, upload a clip + try live; confirm bed ROI overlay, night-mode gate, "no bed" badge on a bedless clip.

## ADR Section (this plan's load-bearing decisions)

**Decision:** Bed localization = one-shot COCO detection (`yolo26n.pt`, class 59) at start + cached
ROI, preserving single pose pass per frame; bed-exit = post-exit, per-track containment `<0.1`
sustained ~1s, multi-person via `GreedyIouTracker` in-bed→out transition, night-mode operator gate,
"no bed" as graceful normal state, on a new demo page reusing pose/overlay/latch infra.

**Drivers:** one-pass-per-frame cost; multi-occupant false-alarm robustness; separation/reversibility from the fall path.

**Alternatives considered:** per-frame bed re-detection (2× cost, dominated); manual/multimodal ROI (deferred non-goal); centroid trigger (research-refuted); ankle-keypoint / IoU triggers (no confirmed standalone validation).

**Why chosen:** static bed ⇒ cache once; research-backed containment+1s-dwell minimizes false alarms; new page keeps fall path untouched and makes the feature independently removable.

**Consequences:** a second model weight to manage; thresholds are tunable not guaranteed-robust under occlusion/angle (best-effort, documented); product alerting remains backend scope (ADR-003).

**Follow-ups:** pre-exit edge warning; automatic day/night estimation; manual ROI drawing; per-site threshold calibration.

### ADRs to distill (per AGENTS.md — author with documentation-and-adrs after approval)
1. **ADR: 침대 위치 파악 전략 (bed-localization strategy)** — adds "one-shot COCO detection + cache" to
   the per-frame single-pose-pass rule (ADR-005 §3). Cross-cutting: constrains future serving/backend
   integration and any new ROI/zone features.
2. **ADR: 침대 이탈 알림 기준 (bed-exit alert criterion)** — post-exit + containment(<0.1) + ~1s dwell +
   per-track transition + night toggle. Evidence: `docs/research/bed-exit-detection-criteria.md`.

---

## Changelog
- **v1 (draft)** — Planner initial plan from spec + Explore file:line map.
- **v2 (consensus, Critic APPROVE-WITH-CHANGES applied)** — merged all 9 Architect+Critic must-fixes
  + 2 pre-mortem items:
  1. New page runs its **own loop**, never `iter_live_frames`; exit state read from `DetectionResult`,
     not `CurrentPlaybackStatus.is_fall` (Step 6/7).
  2. First-frame one-shot protocol pinned: `first = next(frame_iter)` →
     `itertools.chain([first], frame_iter)` (Step 2/6).
  3. Separate `BedExitParams` dataclass + page-scoped expander; `ClassifierParams` untouched (Step 3/8).
  4. Weight pinned `yolo26n.pt` + runtime assert `names[59]=="bed"` guard (Step 2); spec references
     aligned to `yolo26n.pt`.
  5. `BedExitTracker.update()` track-eviction pruning + test (Step 3).
  6. `demo_ui.build_model` reuse removed — page composes `BedExitModule` directly (Step 6).
  7. `iter_live_frames`/shared infra explicitly NOT changed (Step 7).
  8. Symmetric in-bed entry dwell `bed_in_dwell_sec` + `in_streak_frames` (Step 3, AC-5).
  9. Late-appearing-bed + latch-reset-on-rerun accepted limitations documented (Risks).
- **Consensus reached** (Architect reviewed → Critic APPROVE-WITH-CHANGES → all changes applied).
  Status: **pending approval** — no auto-execution.
