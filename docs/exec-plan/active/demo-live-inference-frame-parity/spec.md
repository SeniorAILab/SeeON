---
slug: demo-live-inference-frame-parity
title: "Demo Live Inference — Consecutive-Frame Parity with Training/Eval"
type: spec
date: 2026-06-12
owner: gobeumsu
issue: 81
status: active
---

# Spec: Demo Live Inference — Consecutive-Frame Parity with Training/Eval

## Why this slug exists

Operator review after the #80 merge: live demo behaviour does not match the
measured NH results. Root cause is a train/serve skew the demo itself
introduced — `app.py` feeds the model every 4th frame
(`VideoFileSource(frame_stride=4)`), while training, NH evaluation, and the
ADR-017 latency budget all assume pose on **every consecutive frame** with
T=30 windows. A demo window therefore spans 4× the trained wall time,
distorting velocity features and sequence dynamics (ADR-013 anti-skew
violated). User directive (2026-06-12): "실제도 학습과 평가처럼 처리를 해야지요."

## Requirements

- R1 **Inference consumes every frame.** The temporal model (and the pose
  module feeding it) sees stride-1 consecutive frames, exactly like the
  training/eval pipelines. No subsampling anywhere on the inference path.
- R2 **Rendering is decimated, not inference.** The UI repaints every Nth
  processed frame (N=4 as today) to keep Streamlit responsive — except a
  change in fall state repaints immediately (an alarm is never delayed by
  decimation).
- R3 **Honest pacing.** Playback paces toward the clip's native fps; when
  pose inference cannot keep up, playback runs slower than real time rather
  than skipping model input.
- R4 `iter_live_frames`'s one-item-per-source-frame contract is unchanged;
  the decimation decision is a pure, unit-tested helper.

## Success criteria

- pytest green; new tests pin the repaint policy (every Nth, fall-edge
  immediate, no skipped model frames).
- docs/rules/streamlit-demo.md §2 reflects the new pacing/decimation rule.
- Operator re-runs the demo and the live behaviour reflects the offline
  operating points (out of band).

## Non-goals

- Event aggregation / alarm debounce (phase-4 candidate, separate decision).
- Camera page changes (`pages/live_camera.py` — wall-clock source, separate
  loop semantics per ADR-011).
- Any model or threshold change.
