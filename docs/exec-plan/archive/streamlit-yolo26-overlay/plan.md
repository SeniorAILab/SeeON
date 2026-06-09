---
slug: streamlit-yolo26-overlay
status: done
author: gobeumsu
date: 2026-06-08
spec: ./spec.md
related-adrs: [ADR-003, ADR-004, ADR-005]
new-adrs: [ADR-006]
---

# Plan — Streamlit YOLO26-pose demo: single model, dual overlay, native scrubbing

> Decisions locked with the user (2026-06-08):
> 1. **`ml/util/` holds the frame-source intake ONLY** (`Frame`/`FrameSource`/`VideoFileSource` — the video↔RTSP unification). The detection contract (`DetectionResult`/`ModelModule`), playback/seek primitives (`video_playback.py`), and overlay all STAY in `demo/`. Dependency direction is strictly `demo → util`; `util` imports nothing from `demo` and owns a self-contained read loop.
> 2. Streamlit rule → **`docs/rules/streamlit-demo.md`**.
> 3. **ADR-006 is MECE** — scoped *only* to the `ml/util/` frame-source placement. Demo-UX stays plan-level (not ADR-worthy).
> 4. **Delete** the melih/tomotsugu/syed fall-classifier models entirely.

## Current-state map (verified, file:line)

- Two-seam types all in one file `ml/demo/seam.py`: `Frame`/`FrameSource`/`VideoFileSource` (stream-seam, `seam.py:37-73`) + `DetectionResult`/`BoundingBox`/`DetectionLabel`/`ModelModule` (model-seam, `seam.py:12-78`).
- Frame I/O primitives in `ml/demo/video_playback.py`: `iter_playback_frames`, `read_frame_at_time`, `read_video_playback_info`, `clamp_seek_time`, `jump_seek_time`, `raw_frame_index_for_time`, `VideoPlaybackInfo`. `VideoFileSource.__iter__` delegates to `iter_playback_frames` (`seam.py:60-73`).
- A single YOLO26-pose inference emits **both** person boxes and keypoints: `YoloPoseModule.predict` (`model_modules.py:50-60`) ← `YoloPoseRunner.predict_full` (`yolo_runtime.py:85-130`).
- Fall-classifier models to delete: `MODEL_SPECS` melih/tomotsugu/syed (`model_registry.py:25-61`), `YoloDetectionModule` (`model_modules.py:13-36`), `YoloFallRunner`+`DetectionBox`+`YoloFrameAnalysis`+`_extract_boxes`+`_normalize_label` (`yolo_runtime.py:22-73,139-171`), `pretrained.py` artifact plumbing, `demo_videos.py` own-demo mapping, `app.py` model selectbox (`app.py:46-68,95-100,264-266`).
- Overlay always draws both boxes and pose (`yolo_overlay.py:41-51`) — no per-overlay flag yet.
- Native-scrubbable playback already exists: `build_annotated_video` → pre-rendered mp4 → `st.video()` (`app.py:111-135`, `annotated_video.py:46-185`). Cache key = source + spec.model_id + threshold + stride + encoding-version (`annotated_video.py:53-66`).
- Import duality (the #1 risk): `streamlit run demo/app.py` puts `ml/demo/` on `sys.path` (bare `from seam import`); pytest uses `pythonpath=["."]=ml/` (`from demo.seam import`). Every demo module carries a `try/except ModuleNotFoundError` dual import.
- Launch: `uv run --directory ml --group demo streamlit run demo/app.py` (`package.json:14`); tests: `pytest` with `pythonpath=["."]` (`pyproject.toml`).
- Seam blast radius: `seam.py`, `yolo_overlay.py`, `annotated_video.py`, `model_modules.py`, `app.py`, `playback_status.py`, `tests/test_seam.py`, `tests/test_playback_status.py`, `tests/test_yolo_overlay.py`.

## Acceptance criteria → see spec.md AC-1..AC-12.

---

## Stage 1 — Extract frame-source intake to `ml/util/` (intake only)

Goal: move ONLY the reusable frame-source intake to `ml/util/` with a self-contained
read loop, one clean import scheme, and `util` depending on nothing in `demo`.

1. Create `ml/util/__init__.py` and `ml/util/frame_source.py` containing `Frame`,
   `FrameSource` (Protocol), and `VideoFileSource`. Give `VideoFileSource.__iter__`
   its **own** self-contained `cv2.VideoCapture` read loop (BGR→RGB, honor
   `start_sec` + `frame_stride`, yield `Frame(index, time_sec, image)`) — moved from
   demo's `iter_playback_frames`. `util` imports nothing from `demo`.
2. **Keep in `demo/`** (do NOT move): the model-seam contract stays in a slimmed
   `demo/seam.py` (`DetectionResult`, `BoundingBox`, `DetectionLabel`, `ModelModule`),
   now importing `Frame` from `util.frame_source`. `demo/video_playback.py` stays
   (seek/scrub helpers: `clamp_seek_time`, `jump_seek_time`, `read_frame_at_time`,
   `read_video_playback_info`, `raw_frame_index_for_time`, `VideoPlaybackInfo`).
   `demo/video_playback.py`'s `iter_playback_frames` becomes a thin wrapper over
   `util.frame_source.VideoFileSource` (single read loop), or is dropped if unused
   after Stage 3.
3. **Kill the import duality**: add a 2-line `sys.path` bootstrap at the top of
   `ml/demo/app.py` inserting the `ml/` root (`Path(__file__).resolve().parent.parent`).
   Then standardize ALL demo imports to package-qualified form (`from util.frame_source
   import ...`, `from demo.seam import ...`) and **delete every `try/except
   ModuleNotFoundError` dual-import block**. Both streamlit and pytest then resolve
   `util` + `demo` off `ml/` on `sys.path`.
4. Update importers of the moved names (`Frame`/`FrameSource`/`VideoFileSource`):
   `demo/seam.py`, `annotated_video.py`, `model_modules.py`, `app.py`, plus any test.
5. Tests: split `tests/test_seam.py` → `tests/test_util_frame_source.py`
   (`FrameSource`/`VideoFileSource`/`Frame`, importing `from util.frame_source`) +
   keep the model-seam tests as `tests/test_seam.py` (`DetectionResult`/`ModelModule`,
   `from demo.seam`). Fix `test_playback_status.py`, `test_yolo_overlay.py` imports.
6. **Guard**: add a test asserting `util` has no `demo` import (grep or import-graph
   check) so the dependency direction can't silently invert.
7. **Verify**: `ruff check .` clean; `pytest -q` green; headless launch smoke test.
8. **Commit** (atomic): `refactor(ml): extract frame-source intake to ml/util/`.

## Stage 2 — Delete the bbox fall-classifier comparison models

1. `model_registry.py` — delete `MODEL_SPECS` (3 specs), `available_pretrained_specs`, `ModelSpec`, `ModelBackend` (whole module likely deletable; confirm no other importer).
2. `yolo_runtime.py` — delete `YoloFallRunner`, `DetectionBox`, `YoloFrameAnalysis`, `_extract_boxes`, `_normalize_label`. Keep `YoloPoseRunner`, `_load_yolo_model`, `PoseDetections`.
3. `model_modules.py` — delete `YoloDetectionModule`. Keep `YoloPoseModule`.
4. `pretrained.py` — delete artifact-materialization tied to the specs; delete module if now unused. (Leave on-disk `ml/artifacts/pretrained/*/best.pt` — gitignored, local-only; not committed.)
5. `demo_videos.py` / `app_assets` — delete the per-model "own demo" mapping (`app.py:95-100`).
6. `annotated_video.py` — drop `spec`/`threshold`/`YoloDetectionModule`; annotate from `YoloPoseModule` only; rework `build_annotated_video` + cache key (Stage 3).
7. `app.py` — delete model selectbox (`app.py:46-68`), `_own_demo_filenames`, `_load_detection_module`, `conf_threshold` slider (pose conf is internal).
8. Tests — delete/trim `test_demo_model_registry.py`, `test_demo_pretrained.py`, `test_demo_videos.py` per what remains.
9. **Verify** ruff + pytest + grep that no `YoloFallRunner`/`YoloDetectionModule`/`melih|tomotsugu|syed` references remain in demo paths.
10. **Commit**: `refactor(ml): drop bbox fall-classifier comparison models from demo`.

## Stage 3 — Size selection + independent bbox/pose overlays + native scrubbing

1. `YoloPoseModule.__init__` + `YoloPoseRunner` — accept a `size: str` (`n/s/m/l/x`) → `yolo26{size}-pose.pt`. Add a `pose_weight_filename(size)` helper with validation (reject unknown sizes).
2. `yolo_overlay.render_yolo_overlay(frame, result, *, show_boxes=True, show_pose=True)` — honor the two flags; all four combinations render correctly (AC-3).
3. `app.py` UI (compact/minimal): one `st.selectbox`/`st.radio` for size (`n/s/m/l/x`) + two `st.checkbox`es (Show bbox, Show pose). No model picker, no threshold slider.
4. `annotated_video.py` — `annotated_video_path` cache key now includes `size` + `show_boxes` + `show_pose` + encoding-version (AC-5). `build_annotated_video` renders the overlay honoring the flags, writes the native mp4; `app.py` hands it to `st.video()` (AC-4). Keep the existing progress bar for first render.
5. Forward-looking seam: keep the `ModelModule` Protocol as the extension point for "choose pose model + classifier later." Do **not** add classifier UI now — leave the seam and document it (ADR-006 + rules).
6. **Verify**: unit tests for `pose_weight_filename` size→path (AC-2), overlay flags (AC-3), cache-key inputs (AC-5); headless launch.
7. **Commit**: `feat(ml): YOLO26-pose size selection + independent bbox/pose overlays + native scrubbing`.

## Stage 4 — ADR-006 (MECE) + docs/rules + doc updates

1. **ADR-006** `docs/decisions/ADR-006-frame-source-intake-in-ml-util.md` — MECE scope: *only* "the frame-source intake (`Frame`/`FrameSource`/`VideoFileSource` — the video↔live-stream unification) lives in `ml/util/`, so serving/future-realtime reuse one frame-intake without coupling to `demo/`; presentation (playback/seek/overlay) and the detection contract stay in `demo/` until reuse demands otherwise (YAGNI)." Records the strict `demo → util` dependency direction. References ADR-005 (does not reverse its two-seam design — only places the stream-seam) and ADR-003 (serving reuse). **Explicitly excludes** demo-UX + detection-contract placement to stay mutually exclusive from the plan and from ADR-005.
2. **docs/rules/streamlit-demo.md** — Streamlit conventions rule: compact/minimal UI; native-scrubbable playback = pre-rendered annotated mp4 + `st.video()` (never per-seek re-encode); independent overlay toggles via checkbox; cache key must include every render-affecting input (size + toggles); model/size/classifier selection goes through the `ModelModule` seam. Create `docs/rules/README.md` index.
3. **architecture.md** — add `ml/util/` to the directory tree; add ADR-006 row to the Key ADRs table.
4. **AGENTS.md** — add `docs/rules/` to the Way point tree + a one-line note in Locations.
5. **Commit**: `docs: ADR-006 ml/util placement + Streamlit demo conventions rule`.

## Stage 5 — Ship via /git-workflow-and-versioning

1. Push `feature/streamlit-yolo26-overlay`.
2. PR → `main` with a summary referencing spec + ADR-006; verification evidence (ruff, pytest, headless launch) in the body.
3. Merge to `main`, delete branch, sync local.
4. Move this exec-plan folder `active/streamlit-yolo26-overlay/` → `archive/` with `status: done` once merged (per AGENTS.md lifecycle).

### Headless launch smoke-test recipe (AC-7)
```
uv run --directory ml --group demo --group test \
  streamlit run demo/app.py --server.headless true --server.port 8599 &
# poll http://localhost:8599/_stcore/health for "ok", assert no ImportError in logs, then kill
```

## Risks & mitigations

- **R1 Import resolution (streamlit script-dir vs pytest pythonpath).** Mitigate: `sys.path` bootstrap in `app.py` + package-qualified imports; AC-7 headless launch is a hard gate, not assumed.
- **R2 Deletion cascade.** Removing the fall-classifier touches registry/pretrained/demo_videos/annotated_video/app. Mitigate: grep sweep + full pytest after Stage 2 before moving on.
- **R3 Large weight download.** `yolo26{s,m,l,x}-pose.pt` download on first selection; large; `*.pt` already gitignored (`.gitignore:34`). Never commit; note first-select latency in the rules doc.
- **R4 Re-render on toggle.** Each (size × bbox × pose) combo re-renders the mp4 once; cached thereafter via the cache key. Progress bar covers first render. Acceptable for a dev demo.
- **R5 ADR MECE drift.** Keep ADR-006 strictly to module placement; demo-UX stays here in the plan. Reviewer checks the two don't overlap.
- **R6 Orphaned pretrained artifacts.** On-disk `ml/artifacts/pretrained/*` become unused; gitignored/local — leave them, do not commit removal noise.

## Verification (final gate)
- [ ] `uv run --directory ml ruff check .` clean
- [ ] `uv run --directory ml --group test pytest -q` green
- [ ] Headless streamlit launch returns health ok, no ImportError
- [ ] `git status` shows no `*.pt`, no `ml/data/`, `ml/.scratch/`, `ml/runs/` (AC-11)
- [ ] ADR-006 present + MECE; `docs/rules/streamlit-demo.md` present (AC-9/10)
- [ ] PR merged to main; exec-plan folder archived with `status: done`
