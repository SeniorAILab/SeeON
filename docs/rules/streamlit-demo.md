# Rule: Streamlit demo conventions

> Scope: `ml/demo/` (the developer Streamlit tool, not the product UI).
> These are conventions every change to the demo must follow.
>
> **Decision references (not repeated here):**
> live per-frame inference as the standard observation mode →
> [ADR-010](../decisions/ADR-010-realtime-live-inference-demo-mode.md);
> live-camera page and `CameraSource` →
> [ADR-011](../decisions/ADR-011-live-camera-intake-and-multipage-demo.md).

## 1. Allowed operator controls

The following controls are legitimate in the demo. Do not remove them; do not
add knobs that duplicate model-seam internals.

- **Classifier selectbox** — `select_classifier_spec()` from `demo.demo_ui`;
  renders a "분류 모델" selectbox over `CLASSIFIER_REGISTRY`.
- **Detection-parameter expander** — `select_classifier_params()` from
  `demo.demo_ui`; "탐지 파라미터" expander (collapsed by default) exposing
  `conf`, `window`, `stride`, `sustained_down_sec`.
- **YOLO26-pose size selectbox** — inside `render_live_controls()`; uses
  `POSE_MODEL_SIZE_LABELS` for human-readable hardware-cost labels (e.g.
  `nano · fastest`, `large · accurate`).
- **Overlay toggles** — bounding boxes and pose skeleton as independent
  `st.checkbox` controls inside `render_live_controls()`; see Rule 3.
- **Domain / role segmented-control row** (operator mode only) — domain
  selector + role selector rendered side by side via `st.columns` inside
  `_list_videos_for_mode()`; absent in public mode.

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
- Pacing: compute `frame_interval = frame_stride / max(fps, 1.0)` and sleep
  toward it with `time.sleep(delay)` when `delay > 0`.

## 3. Independent overlay toggles

Bounding boxes and the pose skeleton are **independent render options** on a
single `DetectionResult` (per ADR-005 §3), not separate models. Expose each as
its own `st.checkbox`; all four on/off combinations must render correctly, and
"both off" returns a clean frame. `render_yolo_overlay(frame, result,
show_boxes=..., show_pose=...)` honors the flags.

## 4. Public mode — nursing-home data never exposed

The demo defaults to `FALL_DEMO_MODE=public` (fail-safe):

| Mode | Who | Video sources | Default? |
|------|-----|---------------|----------|
| `public` | external testers (deployed) | **only clips uploaded in the current browser session** | **yes — fail-safe** |
| `operator` | local development | `ml/data/{domain}/{raw,processed}` internal clips + uploads | explicit opt-in |

- **The default is `public` on purpose.** A deployment that forgets to set
  `FALL_DEMO_MODE` must **never** expose nursing-home footage
  (ADR-012 Access Boundary). Never flip the default to `operator`.
- **Public-mode invariants:** internal domain sources are not listed, not
  reachable by any widget, and uploads outside the current session's
  `st.session_state["session_upload_ids"]` set are not shown. Session
  filtering lives in `app.py`; `video_registry` stays mode-agnostic.
- **Local operator run:**

  ```bash
  FALL_DEMO_MODE=operator pnpm dev:demo
  # or directly:
  cd ml && FALL_DEMO_MODE=operator uv run streamlit run demo/app.py
  ```

- The upload widget works in both modes and accepts the
  `SUPPORTED_VIDEO_EXTENSIONS` set (mp4, mov, avi, mkv).
- `video_id` format is `"{domain}/{role}/{filename}"` — unique within one
  `ml/data/` root; never reintroduce the role-only format (it collides across
  domains).

## 5. Upload session scope

Uploads are **session-scoped**. `video_registry` is mode-agnostic; the session
filter (`app_assets.SESSION_UPLOAD_IDS_KEY`) lives exclusively in `app.py`.
Do not push session filtering into the registry.

## 6. Model / size / classifier selection goes through the model-seam

Selecting the pose model size is a **one-line weight swap through the model-seam**
(`pose_weight_filename(size)` → `yolo26{size}-pose.pt`), not bespoke UI logic.
Any future "choose pose model" or "choose downstream classifier" control must be
wired through `demo.classifiers` / `demo.model_modules`, leaving the renderer
and downstream consumers untouched (ADR-005 §3). Do not branch the UI on
framework internals.

## 7. Operational notes

- **First-select latency.** `yolo26{s,m,l,x}-pose.pt` weights download on first
  selection and are large. They cache to `ml/weights/` (not the `ml/` root) via
  `pose_weight_path(size)` — see [ml-filesystem-layout.md](./ml-filesystem-layout.md)
  and ADR-007. `*.pt` is gitignored — never commit weights. Expect a one-time
  download delay when a size is picked for the first time.
- **Import contract.** `streamlit run demo/app.py` only puts `ml/demo/` on the
  path; pytest uses `pythonpath=["."]` = `ml/`. `app.py` bootstraps `sys.path`
  with the `ml/` root so both resolve the same package-qualified imports
  (`from demo.x import …`, `from util.x import …`). Do not reintroduce
  `try/except ModuleNotFoundError` dual-import shims.
- **Never fabricate data.** Nothing in the demo may paint keypoints, boxes, or
  labels that did not come from a real model inference (ADR-005 §5).
