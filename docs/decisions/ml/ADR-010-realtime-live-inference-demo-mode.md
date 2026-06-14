# ADR-010: Real-Time Per-Frame Live Inference as the Standard Demo Observation Mode (Replacing Pre-Rendered Annotated Video)

## Status

Accepted.

## Date

2026-06-09

## Context

The v1 Streamlit demo observes a model by **pre-rendering** the entire clip:
`build_annotated_video` (`ml/demo/annotated_video.py`) reads every sampled frame,
runs pose + classifier, draws the overlay, and writes a finished mp4 that the UI
then plays back. Observation is therefore *batch*: you wait for a full render,
then watch a fixed file.

This collides with how the project now needs to work. The classifier strategy
(ADR-009) is an iterative, data-driven effort, and the standing requirement is to
**watch top-down fall detection happen live** — "앞으로 계속 실시간 낙상 탐지를
보기 위해서". Batch pre-rendering blocks that: every parameter or model change
costs a full re-render before anything is visible.

Crucially, the pipeline is **already frame-by-frame** — `Frame → pose →
classifier.update(time_sec) → overlay` — and `VideoFileSource`
(`ml/util/frame_source.py`, ADR-006) already yields `Frame`s one at a time with
seek support. Live observation is therefore a **small surgery on the rendering
loop**, not a rewrite of the inference path. Choosing the standard observation
mode is a cross-cutting demo-architecture decision (it governs all future model
evaluation in the demo), so it is recorded here rather than buried in a plan.

## Decision

1. **The standard demo observation mode is real-time per-frame live inference**,
   rendered incrementally into a Streamlit placeholder (`st.empty()`), showing the
   overlay and fall state (red box on/off, confidence) **as each frame is
   processed** — not a pre-rendered file played back.

2. **Scope is sequenced — recorded-clip live playback first:**
   - **First:** stream recorded clips from `ml/data/processed` through
     `VideoFileSource` and render live. No device dependencies; the same clips are
     the gold-8 eval substrate.
   - **Later:** live camera / RTSP input (separate, future work).

3. **The pre-render path (`build_annotated_video`) is superseded as the primary
   viewer** and is to be replaced by the live loop.

### MECE boundary (mandatory — ADRs must be MECE)

| Concern | Owning ADR |
|---|---|
| Frame-intake **code location** (`VideoFileSource` lives in `ml/util/`) | ADR-006 |
| Model-seam **contract** + pose backbone | ADR-026 / ADR-025 |
| Demo **observation/playback MODE** — live per-frame vs pre-rendered batch | **ADR-010 (this)** |

This ADR decides only *how the demo presents inference to the observer*. It
reuses ADR-006's intake unchanged and does not touch the ADR-026 seam contract.

## Alternatives Considered

### A. Keep pre-rendered annotated-video playback (status quo)
**Rejected.** Batch render latency blocks iteration, you cannot watch detection
as it happens, and every parameter change forces a full re-render. It exists only
because it was the simplest first cut.

### B. Go straight to live camera / RTSP
**Rejected for now.** Recorded clips are the gold-8 evaluation substrate, need no
capture hardware, and are reproducible. Camera input adds device/transport
concerns orthogonal to the observation-mode decision; it is deferred to follow-up
once recorded-clip live playback is solid.

## Consequences

**Positive:**
- Detection is observable live; classifier/parameter iteration is immediate.
- Direct architectural path to real camera/RTSP later (same live loop, different
  `FrameSource`).
- Reuses the existing frame-by-frame pipeline and ADR-006 intake — minimal new code.

**Negative / Trade-offs:**
- Per-frame Streamlit redraw has throughput limits; playback pacing must be
  managed so the live view stays watchable.
- The pre-render code (`annotated_video.py`) and its tests are retired/replaced —
  some churn.

## Relationship to Other ADRs

- **References ADR-006** — reuses `VideoFileSource` frame intake unchanged.
- **References ADR-026 and ADR-025** — the per-frame inference seam and pose backbone are the same; only the
  presentation changes.
- **Implementation** is tracked in GitHub issue **#39**. This ADR records the
  *decision*; the issue records the *how*.

## Errata

**Decision bullet 2 path correction (ADR-012, accepted 2026-06-10).**
"Stream recorded clips from `ml/data/processed`" refers to the input-role
processed clips. ADR-012 introduced domain-first layout: those clips now live
at `ml/data/{domain}/processed/` (e.g. `ml/data/nursing-home/processed/`).
The decision itself — recorded-clip live playback first, camera/RTSP later —
is unchanged.
