---
slug: streamlit-yolo26-overlay
status: done
author: gobeumsu
date: 2026-06-08
related-adrs: [ADR-003, ADR-004, ADR-005]
---

# Spec — Streamlit YOLO26-pose demo: single model, dual overlay, native scrubbing

## What this is

Rework the Streamlit ML demo (`ml/demo/`) around a single, size-selectable
YOLO26-pose model that drives **both** a person-bbox overlay and a pose-skeleton
overlay, independently toggleable, over a YouTube-like natively-scrubbable video
player. In the same change, relocate the cross-cutting **stream intake** code out
of `demo/` into a shared `ml/` package, because video files and live streams are
the same "frame source" abstraction that serving/realtime will reuse — it is
util-character, not demo-specific.

This is a **developer demo** (ADR-003 demo lifecycle), not the product UI and not
a clinical prediction path.

## Background / why

- ADR-005 pivoted the stack to YOLO26-pose and introduced a two-seam architecture
  (stream-seam `FrameSource`, model-seam `ModelModule.predict → DetectionResult`),
  but placed both seams in `ml/demo/seam.py`.
- The bbox fall-classifier comparison models (melih / tomotsugu / syed,
  `ml/demo/model_registry.py:25-61`) were kept as comparison modules. The user has
  now confirmed YOLO26-pose is the fixed direction and wants the demo surface
  stripped to YOLO26 only.
- A single YOLO26-pose inference already emits **both** person bounding boxes and
  COCO-17 keypoints (`ml/demo/model_modules.py:50-60`, `yolo_runtime.py:85-130`),
  so one model can drive both overlays — the separate fall-classifier models are
  no longer needed on the demo surface.
- The user wants to minimize future code churn: the frame-intake module (unifying
  stored video + live RTSP) belongs in a util/common home, reusable by serving and
  a future realtime path without touching `demo/`.

## In scope

1. **Single model = YOLO26-pose**, size-selectable (`n/s/m/l/x` →
   `yolo26{size}-pose.pt`) through the model-seam (one-line weight swap).
2. **Dual overlay from one model**: person bbox overlay and pose-skeleton overlay,
   each independently toggleable (checkbox / radio), compact minimal UI.
3. **Native-scrubbable playback**: build on the existing pre-rendered annotated-mp4
   + `st.video()` approach (commit `aa7eddc`, `ml/demo/annotated_video.py`) so the
   user can freely drag the playback position and it renders smoothly. Overlay-toggle
   state and model size become part of the annotation cache key.
4. **Remove the other models from the demo surface**: drop the melih/tomotsugu/syed
   selectbox and their `ModelSpec` registry usage *from the demo path*. (Decision
   point: whether to delete the specs/artifacts entirely or keep them out of the UI
   — see Open Decisions.)
5. **Relocate the frame-source intake only** (`Frame`, `FrameSource`,
   `VideoFileSource` — the video↔RTSP unification) out of `ml/demo/` into a
   lightweight `ml/util/`. Everything else stays in `demo/`: the model-seam
   contract (`DetectionResult`/`BoundingBox`/`DetectionLabel`/`ModelModule`), the
   playback/seek primitives (`video_playback.py`), and overlay rendering — none of
   those are reused outside the demo (serving consumes a stream forward; it never
   seeks). Dependency direction is strictly `demo → util`; `util` imports nothing
   from `demo` and owns a self-contained frame-read loop.
6. **ADR** capturing the relocation + demo-UX architecture decision.
7. **Streamlit conventions rule** doc written down as a project rule.
8. **Forward-looking UI shape** (design the seam for, even if not all wired now):
   user can later choose the pose-detection model AND a downstream fall classifier,
   and view bbox + pose. Do not build the classifier now — leave a clean seam.

## Out of scope (explicitly)

- The temporal fall classifier (the layer that decides "fall" from a keypoint
  window) — deferred per ADR-005. Only leave a seam for it.
- Any training / fine-tuning, model scale-up re-measurement (separate ADR-005
  roadmap item).
- Product frontend (`front/`), backend, serving `/predict` changes.
- Committing or pushing any private footage or weights (ADR-004).

## Acceptance criteria (testable)

- **AC-1** The demo exposes exactly one detection model family (YOLO26-pose); the
  melih/tomotsugu/syed model selectbox is gone from `app.py`. No demo code path
  instantiates `YoloFallRunner` / `YoloDetectionModule`. *(verify: grep app.py +
  manual launch)*
- **AC-2** A model-size control offers `n/s/m/l/x`; selecting a size loads
  `yolo26{size}-pose.pt` via the model-seam. *(verify: unit test on the size→path
  mapping; manual launch)*
- **AC-3** Two independent overlay toggles exist (bbox, pose). All four
  on/off combinations render correctly: both, bbox-only, pose-only, neither.
  *(verify: unit test on `render_yolo_overlay` honoring per-overlay flags)*
- **AC-4** Playback uses the native `st.video()` scrubbable player; seeking to an
  arbitrary position plays smoothly (no per-seek re-encode). *(verify: manual;
  annotated mp4 exists and is handed to st.video)*
- **AC-5** The annotation cache key includes model size + both overlay-toggle
  states, so changing any of them yields a distinct cached artifact and a stale one
  is never shown. *(verify: unit test on `annotated_video_path` cache-key inputs)*
- **AC-6** The frame-source intake (`Frame`/`FrameSource`/`VideoFileSource`) lives
  in `ml/util/` with a self-contained read loop; `ml/demo/` imports it from there.
  `ml/util/` imports nothing from `ml/demo/`. Playback/seek primitives, overlay,
  and the detection contract remain in `demo/`. *(verify: file layout + grep
  imports + assert no `demo` import inside `util/`)*
- **AC-7** `uv run --directory ml --group demo streamlit run demo/app.py` launches
  with no import error, AND `uv run --directory ml --group test pytest -q` passes.
  Both import modes (streamlit script-dir path + pytest `pythonpath=["."]`) work.
  *(verify: actually launch the app headless + run pytest)*
- **AC-8** `uv run --directory ml ruff check .` passes clean.
- **AC-9** A new ADR exists in `docs/decisions/` documenting the seam relocation +
  demo-UX architecture, referencing ADR-005.
- **AC-10** A Streamlit conventions rule doc exists in its decided home, covering:
  compact/minimal UI, native-scrubbable playback approach, independent overlay
  toggles, and the model-size/model/classifier selection pattern.
- **AC-11** No private footage, no model weights, no `ml/runs/` or `ml/.scratch/`
  artifacts are committed (ADR-004). *(verify: git status + check-ignore)*
- **AC-12** The whole change ships through `/git-workflow-and-versioning`
  (branch → atomic commits → PR → merge), `.mcp.json`-style unrelated noise kept out.

## Hard constraints

- YOLO26 is fixed for pose. Never fabricate ground-truth / labels / synthetic pose
  into `ml/`.
- Private footage (`ml/data/`, `ml/.scratch/`) and weights NEVER pushed (ADR-004).
- Reuse the existing seam dataclasses/Protocols — no ABC/registry (YAGNI, ADR-005).
- Keep ruff clean + pytest green at every commit.
- Every work item goes through `/git-workflow-and-versioning` (standing user rule).

## Decisions (settled with user 2026-06-08)

1. **util scope** → `ml/util/` holds the **frame-source intake only** (`Frame`/
   `FrameSource`/`VideoFileSource`). Detection contract + playback/seek + overlay
   stay in `demo/`. Promote the contract to `util/` only when serving needs it (YAGNI).
2. **Streamlit rule home** → `docs/rules/streamlit-demo.md`.
3. **ADR shape** → new **ADR-006**, MECE-scoped to *only* the `ml/util/` frame-source
   placement; references ADR-005, does not reverse it. Demo-UX stays plan-level.
4. **Fall-classifier models** → **delete** melih/tomotsugu/syed specs + runner +
   module + pretrained plumbing + their tests entirely.
