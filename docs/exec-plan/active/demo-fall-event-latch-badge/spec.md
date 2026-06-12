---
slug: demo-fall-event-latch-badge
title: "Demo — Minimal Latched Fall-Event Badge"
type: spec
date: 2026-06-12
owner: gobeumsu
issue: 83
status: active
---

# Spec: Demo — Minimal Latched Fall-Event Badge

## Why this slug exists

The per-window classifier honestly returns to 정상 once the fall motion exits
the T=30 window (correct trained semantics; the offline "catch" definition is
"≥1 positive window in the fall interval"). Operator review (#81 demo run):
the transient 🔴 is easy to miss and the "a fall happened" fact disappears
from screen. User directive (2026-06-12): keep the raw signal, add a
**minimal latched badge**.

## Requirements

- R1 **Latch, don't fabricate**: on the first frame where fall state turns
  positive, show a badge — 🚨 낙상 감지, onset time, onset count — and keep it
  until the clip ends. Pure aggregation of real inference outputs
  (ADR-005 §5: nothing painted that didn't come from a real inference).
- R2 **Raw signal untouched**: the per-frame status line and overlay behave
  exactly as today; the badge is an additional placeholder above them.
- R3 **Pure, tested core**: onset detection/latching is a Streamlit-free
  helper (`FallEventLatch`) in `demo/live_view.py`, unit-tested; app.py only
  renders.
- R4 Multiple onsets accumulate (count + first onset time shown).

## Success criteria

- pytest green; latch helper covered (first onset, re-entry counting, no
  events, time stamping).
- Operator sees the badge persist after the fall while raw status returns to
  정상 (out of band).

## Non-goals

- Product alerting (ack flow, notifications, persistence) — backend scope
  (ADR-003). Camera page (ADR-011). Any model/threshold change.
