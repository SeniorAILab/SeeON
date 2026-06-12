---
slug: demo-live-inference-frame-parity
title: "Demo Live Inference — Consecutive-Frame Parity — Execution Plan"
type: plan
date: 2026-06-12
owner: gobeumsu
issue: 81
created-from-spec: demo-live-inference-frame-parity/spec.md
status: active
---
<!-- NOTE: plan body is immutable after finalize (first commit including this file).
     Scope change -> new slug + status: superseded-by. -->

# Plan: Demo Live Inference — Consecutive-Frame Parity

## Step 1 — Repaint-policy helper (pure, testable)

`demo/live_view.py` gains `render_due(frame_count, render_stride, is_fall,
last_painted_fall) -> bool`: True every `render_stride`-th frame and
immediately whenever `is_fall != last_painted_fall`. `iter_live_frames`
itself is untouched (one item per source frame, ADR-010 core).

## Step 2 — app.py rewires the live loop

- `PLAYBACK_FRAME_STRIDE` → `RENDER_FRAME_STRIDE` (still 4): the source is
  built with stride 1 (`VideoFileSource(path)`), so the model consumes every
  consecutive frame.
- Pacing: `frame_interval = 1.0 / max(fps, 1.0)` per processed frame; sleep
  only when ahead (existing behaviour degrades honestly to slower-than-real-
  time when pose can't keep up).
- The loop paints frame + status only when `render_due(...)`; completion
  message reports processed frames (= all frames).

## Step 3 — Docs + tests

- `docs/rules/streamlit-demo.md` §2: pacing formula and the new rule —
  inference is never strided; only rendering is decimated; fall-state edges
  repaint immediately.
- New tests in `tests/test_live_view.py`: render_due cadence, fall-edge
  immediate repaint (both directions), stride-1 source contract in app
  constants (RENDER_FRAME_STRIDE exists, no frame_stride arg on the live
  playback source construction — asserted via inspection of app source to
  keep Streamlit out of unit tests).

## Acceptance

- `uv run pytest tests/ -q` green.
- Demo run shows decimated rendering but full-rate inference (operator
  verification out of band).
