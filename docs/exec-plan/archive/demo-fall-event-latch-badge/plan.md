---
slug: demo-fall-event-latch-badge
title: "Demo — Minimal Latched Fall-Event Badge — Execution Plan"
type: plan
date: 2026-06-12
owner: gobeumsu
issue: 83
created-from-spec: demo-fall-event-latch-badge/spec.md
status: done
---
<!-- NOTE: plan body is immutable after finalize (first commit including this file).
     Scope change -> new slug + status: superseded-by. -->

# Plan: Demo — Minimal Latched Fall-Event Badge

Stacked on `demo-live-inference-frame-parity` (#81 / PR #82).

## Step 1 — `FallEventLatch` (pure, demo/live_view.py)

Stateful helper: `update(is_fall, time_sec) -> bool` returns True on a rising
edge (정상→낙상); tracks `event_count` and `first_event_sec`. No Streamlit.

## Step 2 — app.py badge placeholder

`event_ph = st.empty()` above the status line. In the live loop, feed the
latch with `status.is_fall` and the frame clock (`processed * frame_interval`
— same clock pacing uses); on each onset repaint:
`🚨 낙상 감지 {count}회 — 최초 {first:.1f}s (영상 종료까지 유지)`.
Placeholder content persists after the loop ends; a fresh 재생 resets it.

## Step 3 — Docs + tests

- rule doc §2: one bullet — the badge is latched aggregation of real
  inference, never fabricated state.
- tests in `tests/test_live_view.py`: no-fall → no event; single onset time
  + count; multiple onsets count; sustained fall counts once.

## Acceptance

`uv run pytest tests/ -q` green; badge behaviour confirmed by operator.
