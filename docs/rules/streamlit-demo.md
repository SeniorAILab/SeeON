# Rule: Streamlit demo conventions

> Scope: `ml/demo/` (the developer Streamlit tool, not the product UI).
> These are conventions every change to the demo must follow.
>
> **Decision references (not repeated here):**
> live per-frame inference as the standard observation mode →
> [ADR-010](../decisions/ml/ADR-010-realtime-live-inference-demo-mode.md);
> live-camera page and `CameraSource` →
> [ADR-011](../decisions/ml/ADR-011-live-camera-intake-and-multipage-demo.md).

## 1. Allowed operator controls

The following controls are legitimate in the demo. Do not remove them; do not
add knobs that duplicate model-seam internals.

- **Classifier selectbox** — `select_classifier_spec()` from `demo.demo_ui`;
  renders a "분류 모델" selectbox over `CLASSIFIER_REGISTRY`. The registry is
  derived from `training.models.catalog.CATALOG`: every model family whose
  trained artifact exists on disk is exposed automatically — never hand-list
  families in the demo.
- **판정 임계값 slider** — `select_decision_threshold(spec)` from
  `demo.demo_ui`; shown for available temporal models only. Default comes from
  `demo.thresholds.default_threshold` (NH-measured operating point where one
  exists, else the artifact's LE2I `operating_threshold`). NH values are a
  committed demo-side mapping citing
  `ml/experiments/analysis/phase3-step2-nh-threshold-policy.md` — metadata.json
  is overwritten on retrain and never carries NH-derived numbers.
- **Detection-parameter expander** — `select_classifier_params()` from
  `demo.demo_ui`; "탐지 파라미터" expander (collapsed by default) exposing
  `conf`, `window`, `stride`, `sustained_down_sec`.
- **YOLO26-pose size selectbox** — inside `render_live_controls()`; uses
  `POSE_MODEL_SIZE_LABELS` for human-readable hardware-cost labels (e.g.
  `nano · fastest`, `large · accurate`).
- **Overlay toggles** — bounding boxes and pose skeleton as independent
  `st.checkbox` controls inside `render_live_controls()`; see Rule 3.
- **Domain / role segmented-control row** — domain selector + role selector
  rendered side by side via `st.columns` inside `_list_videos()`.

Lay related controls side by side (`st.columns`) rather than stacking
full-width widgets.

## 2. Live frame rendering — `st.empty().image` pattern

Processed frames are rendered immediately into a single Streamlit placeholder:

```python
frame_ph = st.empty()
...
frame_ph.image(overlay, channels="RGB", use_container_width=True)
```

- Reuse **one** `st.empty()` placeholder per frame display area; never append
  new image elements in a loop (causes infinite DOM growth).
- Do **not** write mp4 files or call `st.video()` for the live-loop playback
  path.
- **Inference is never strided.** The model consumes every consecutive frame
  (stride-1 `VideoFileSource`) so live windows match the training/eval
  pipelines (ADR-013 anti-skew). Only the *repaint* is decimated — every
  `RENDER_FRAME_STRIDE`-th frame via `render_due()`, which also repaints
  immediately on any fall-state change so decimation never delays an alarm.
- Pacing: `frame_interval = 1.0 / max(fps, 1.0)` per processed frame; sleep
  toward it with `time.sleep(delay)` when `delay > 0`. When pose can't keep
  up, playback runs slower than real time — frames are never skipped.
- **Latched event badge** — `FallEventLatch` (demo.live_view) turns rising
  edges of the raw fall signal into a persistent 🚨 badge (first onset time +
  count) above the status line. It is aggregation of real inference only —
  it never invents or extends a fall state (ADR-027); the raw per-frame
  status stays untouched. Product alerting (ack, notifications) is backend
  scope (ADR-023), not the demo's.

## 3. Independent overlay toggles

Bounding boxes and the pose skeleton are **independent render options** on a
single `DetectionResult` (per ADR-027), not separate models. Expose each as
its own `st.checkbox`; all four on/off combinations must render correctly, and
"both off" returns a clean frame. `render_yolo_overlay(frame, result,
show_boxes=..., show_pose=...)` honors the flags.

## 4. Local-only demo — all data sources available

The demo is a local developer/operator tool with no external/deployed surface
([ADR-045](../decisions/common/ADR-045-streamlit-demo-local-only.md), superseding
ADR-028; non-product per [ADR-024](../decisions/common/ADR-024-ml-demo-product-surface-boundary.md)).
There is no `FALL_DEMO_MODE` and no public/operator branching: the demo always
lists every internal `ml/data/{domain}/{raw,processed}` source plus session
uploads, and always offers the laptop camera as a live source.

- **Run it:**

  ```bash
  pnpm dev:demo
  # or directly:
  cd ml && uv run streamlit run demo/app.py
  ```

- **Never expose this demo externally as-is** — it lists patient-adjacent
  nursing-home footage by design. Reviving a hosted demo requires a new
  data-access-boundary ADR first (ADR-045). Footage custody (footage stays on
  operator disks, out of Git) is owned by
  [ADR-018](../decisions/ml/ADR-018-cross-machine-dataset-custody.md), not a demo runtime mode.
- The upload widget accepts the `SUPPORTED_VIDEO_EXTENSIONS` set (mp4, mov, avi, mkv).
- `video_id` format is `"{domain}/{role}/{filename}"` — unique within one
  `ml/data/` root; never reintroduce the role-only format (it collides across
  domains).

## 5. Upload handling

Uploads persist to `ml/data/uploads/` via `video_registry.persist_uploaded_video`
and then appear under the `uploads` domain like any other source. `handle_upload`
(`app_assets.py`) only de-duplicates re-uploads within a session (`seen_uploads`)
so the same file is not persisted twice. `video_registry` stays UI-agnostic — do
not push upload bookkeeping into the registry.

## 6. Model / size / classifier selection goes through the model-seam

Selecting the pose model size is a **one-line weight swap through the model-seam**
(`pose_weight_filename(size)` → `yolo26{size}-pose.pt`), not bespoke UI logic.
Any future "choose pose model" or "choose downstream classifier" control must be
wired through `demo.classifiers` / `demo.model_modules`, leaving the renderer
and downstream consumers untouched (ADR-026/027). Do not branch the UI on
framework internals.

## 7. Operational notes

- **First-select latency.** `yolo26{s,m,l,x}-pose.pt` weights download on first
  selection and are large. They cache to `ml/weights/` (not the `ml/` root) via
  `pose_weight_path(size)` — see [ml-filesystem-layout.md](./ml-filesystem-layout.md)
  and ADR-015. `*.pt` is gitignored — never commit weights. Expect a one-time
  download delay when a size is picked for the first time.
- **Import contract.** `streamlit run demo/app.py` only puts `ml/demo/` on the
  path; pytest uses `pythonpath=["."]` = `ml/`. `app.py` bootstraps `sys.path`
  with the `ml/` root so both resolve the same package-qualified imports
  (`from demo.x import …`, `from util.x import …`). Do not reintroduce
  `try/except ModuleNotFoundError` dual-import shims.
- **Never fabricate data.** Nothing in the demo may paint keypoints, boxes, or
  labels that did not come from a real model inference (ADR-027).
