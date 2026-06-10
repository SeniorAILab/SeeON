# Rule: Streamlit demo conventions

> Scope: `ml/demo/` (the developer Streamlit tool, not the product UI).
> These are conventions every change to the demo must follow.

## 1. Compact, minimal UI

The demo is a research/dev instrument, not a product surface. Keep controls
minimal and dense: a video selector, a model-size selector, and overlay toggles
are enough. Do **not** add model pickers, threshold sliders, or other knobs that
duplicate what the model-seam already decides. Lay related controls out side by
side (`st.columns`) rather than stacking full-width widgets.

## 2. Native-scrubbable playback = pre-rendered annotated mp4 + `st.video()`

Playback must be **natively scrubbable** (YouTube-like free seek), never a
re-encode-on-every-seek loop. The pattern:

1. Pre-render the full annotated video once to an mp4
   (`build_annotated_video` → `cv2.VideoWriter`, `avc1` codec).
2. Hand the file to `st.video()`, which gives the browser native seeking.

Never render per-seek in Python. A first render shows a progress bar; every
subsequent view of the same (video × size × toggles) combination is served from
the cached mp4.

## 3. Independent overlay toggles via checkbox

Bounding boxes and the pose skeleton are **independent render options** on a
single `DetectionResult` (per ADR-005 §3), not separate models. Expose each as
its own `st.checkbox`; all four on/off combinations must render correctly, and
"both off" returns a clean frame. `render_yolo_overlay(frame, result,
show_boxes=..., show_pose=...)` honors the flags.

## 4. The cache key must include every render-affecting input

`annotated_video_path` derives a content hash that gates whether a new mp4 is
rendered. It **must** fold in every input that changes the rendered pixels:
source-file identity (path + size + mtime), model `size`, `show_boxes`,
`show_pose`, `frame_stride`, and the encoding version. Omitting any one of these
serves a stale overlay. When you add a new render-affecting control, add it to
the cache key in the same change.

## 5. Model / size / classifier selection goes through the model-seam

Selecting the pose model size is a **one-line weight swap through the model-seam**
(`pose_weight_filename(size)` → `yolo26{size}-pose.pt`), not bespoke UI logic.
Any future "choose pose model" or "choose downstream classifier" control must be
wired the same way — by selecting a `ModelModule`, leaving the renderer and
downstream consumers untouched (ADR-005 §3). Do not branch the UI on framework
internals.

## 6. Demo modes — `FALL_DEMO_MODE` (fail-safe default: `public`)

The demo runs in one of two modes, selected by the `FALL_DEMO_MODE`
environment variable:

| Mode | Who | Dropdown sources | Default? |
|------|-----|------------------|----------|
| `public` | external testers (deployed) | **only clips uploaded in the current browser session** | **yes — fail-safe** |
| `operator` | local development | `ml/data/{domain}/{raw,processed}` internal clips + uploads | explicit opt-in |

- **The default is `public` on purpose.** A deployment that forgets to set the
  variable must never expose nursing-home footage (ADR-012 Access Boundary).
  Never flip the default to `operator`.
- **Public-mode invariants:** internal domain sources are not listed, not
  reachable by any widget, and uploads outside the current session's
  `st.session_state["session_upload_ids"]` set are not shown. Session
  filtering happens in the `app.py` layer; `video_registry` stays
  mode-agnostic.
- **Local runs set the mode in the standard command:**

  ```bash
  cd ml && FALL_DEMO_MODE=operator uv run --group demo --group training \
      streamlit run demo/app.py
  ```

- The upload widget works in both modes and accepts the
  `SUPPORTED_VIDEO_EXTENSIONS` set (mp4, mov, avi, mkv).
- `video_id` format is `"{domain}/{role}/{filename}"` — unique within one
  `ml/data/` root; never reintroduce the role-only format (it collides across
  domains).

## 7. Operational notes

- **First-select latency.** `yolo26{s,m,l,x}-pose.pt` weights download on first
  selection and are large. They cache to `ml/weights/` (not the `ml/` root) via
  `pose_weight_path(size)` — see [ml-filesystem-layout.md](./ml-filesystem-layout.md)
  and ADR-007. `*.pt` is gitignored — never commit weights. Expect a one-time
  download/render delay when a size is picked for the first time.
- **Import contract.** `streamlit run demo/app.py` only puts `ml/demo/` on the
  path; pytest uses `pythonpath=["."]` = `ml/`. `app.py` bootstraps `sys.path`
  with the `ml/` root so both resolve the same package-qualified imports
  (`from demo.x import …`, `from util.x import …`). Do not reintroduce
  `try/except ModuleNotFoundError` dual-import shims.
- **Never fabricate data.** Nothing in the demo may paint keypoints, boxes, or
  labels that did not come from a real model inference (ADR-005 §5).
