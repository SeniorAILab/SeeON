# ADR-006: Frame-Source Intake Lives in `ml/util/`, Decoupled from `demo/`

## Status

Accepted. Superseded by ADR-056 (ml/ edge-device relayout, issue #268): frame intake moves from `ml/util/` to `ml/sources/`, and the `Frame`/`FrameSource` stream contract moves to `ml/contracts/frame.py`. `ml/util/` is removed. Body preserved as historical record.

## Date

2026-06-09

## Context

Retired source ADR-005 originally established a **stream-seam** (`FrameSource` — a single iterator that
unifies a stored video file and a live RTSP stream into one sequence of frames)
and a **model-seam** (`ModelModule.predict(frame) → DetectionResult`). At the
time, both seams plus the playback/seek helpers and the overlay renderer all
lived together under `ml/demo/`.

That collocation has one concrete problem. The current seam authority, [ADR-026](./ADR-026-frame-model-seam-architecture.md), preserves the explicit intent
that **stored-video playback and live serving are the same logic** and that the
`FrameSource` intake is shaped so the *serving* path can reuse it later. But
while the intake physically sits inside `ml/demo/`, a future serving/realtime
module cannot reuse it without importing from `demo/` — i.e. without taking a
dependency on a developer-only demo package. The demo is a dev tool, not the product frontend ([ADR-024](../common/ADR-024-ml-demo-product-surface-boundary.md));
serving code reaching into it inverts the intended direction and couples the
production inference path to throwaway UI scaffolding.

This is a **module-placement** decision: *where does the frame-source intake
live so that serving can reuse it without depending on `demo/`?* It is distinct
from, and does not reopen, the seam *design* ([ADR-026](./ADR-026-frame-model-seam-architecture.md)) or the demo *UX* (which
is plan-level detail, not architectural).

## Decision

**The frame-source intake — and only the frame-source intake — moves to
`ml/util/`.**

Concretely, `Frame`, the `FrameSource` Protocol, and `VideoFileSource` (with a
self-contained `cv2.VideoCapture` read loop) live in `ml/util/frame_source.py`.
`ml/util/` is the shared, demo-agnostic home that serving, future realtime, and
the demo can all import without coupling to any one consumer.

The dependency direction is **strictly `demo → util`**: `ml/util/` imports
nothing from `ml/demo/`. This is enforced by a guard test
(`ml/tests/test_util_no_demo_dependency.py`) that AST-parses `ml/util/*.py` and
fails if any `demo` import appears, so the direction cannot silently invert.

### What stays in `demo/` (explicitly out of scope for this ADR)

To keep this decision **MECE** — one decision, no overlap with ADR-026/ADR-025 or the
plan — the following deliberately do **not** move, and their placement is *not*
relitigated here:

- **The model-seam / detection contract** (`DetectionResult`, `BoundingBox`,
  `DetectionLabel`, `ModelModule`) stays in `demo/seam.py`. Only one consumer
  (the demo) exists today; moving it now would be speculative (YAGNI).
- **Playback / seek primitives** (`video_playback.py`: `clamp_seek_time`,
  `jump_seek_time`, `read_frame_at_time`, `read_video_playback_info`,
  `raw_frame_index_for_time`, `VideoPlaybackInfo`) stay in `demo/` — they are
  presentation concerns, not stream intake.
- **Overlay rendering** (`yolo_overlay.py`) stays in `demo/` — a view concern.
- **Demo UX** (size selector, overlay toggles, native-scrubbable playback) is
  plan-level implementation detail, not an architectural decision, and is
  documented in `docs/rules/streamlit-demo.md`, not here.

These move to a shared home **only when a second real consumer demands it**, not
preemptively.

## Relationship to other ADRs

- **References ADR-026; does not supersede it.** ADR-026's two-seam *design*
  stands unchanged. ADR-006 only *places* the stream-seam intake in a shared
  module; it does not alter the seam contract, the model-seam, or the YOLO26-pose
  framework choice governed by [ADR-025](./ADR-025-yolo26-pose-framework-adoption.md).
- **Complements ADR-022 and ADR-023.** The intake is a serving-side
  construct; putting it in `ml/util/` is precisely what lets the FastAPI serving
  path reuse one frame-intake without depending on the demo, honoring the ML lifecycle
  boundary in [ADR-022](./ADR-022-ml-serving-training-lifecycle.md) and the ML/backend boundary in [ADR-023](../common/ADR-023-ml-backend-prediction-boundary.md).

## Alternatives Considered

### A. Leave the intake in `demo/` (status quo)

**Rejected.** Serving reuse would require importing from `demo/`, inverting the
intended dependency direction and coupling production inference to a dev tool.
The whole point of designing `FrameSource` now (current seam authority: ADR-026) is undermined if it
cannot be reached without the demo.

### B. Move *both* seams (stream + model) to `ml/util/`

**Rejected (YAGNI).** The model-seam has exactly one consumer today (the demo).
Relocating it now is speculative generality with no second consumer to justify
it. The stream-seam is different: ADR-026 already names a concrete future
consumer (serving/realtime), so moving *only* it is the minimal, justified step.
The model-seam can follow later if and when a second consumer appears.

### C. A new top-level package (`ml/streaming/` or `ml/common/`)

**Rejected as heavier than needed.** A dedicated streaming package implies a
larger surface (multiple modules, its own lifecycle) than a single
frame-source module warrants today. `ml/util/` is the smallest shared home that
solves the coupling problem; it can grow or be promoted to `ml/streaming/` later
if the intake surface expands.

## Consequences

**Positive:**

- Serving / future realtime can reuse the exact frame-intake the demo uses,
  importing `util.frame_source` with no dependency on `demo/` — the reuse
  ADR-026 designed for is now physically possible.
- The `demo → util` direction is guard-tested, so the coupling cannot silently
  invert.
- The intake has a self-contained read loop (no demo import), making it portable
  to a serving context unchanged.

**Negative / Trade-offs:**

- A second small package boundary (`ml/util/`) now exists; contributors must put
  shared intake there, not in `demo/`.
- The model-seam and stream-seam now live in *different* packages
  (`demo/seam.py` vs `util/frame_source.py`), which a reader of ADR-026 (where
  they were colocated) must be aware of. This ADR is the pointer that records the
  split and the reason for it.
