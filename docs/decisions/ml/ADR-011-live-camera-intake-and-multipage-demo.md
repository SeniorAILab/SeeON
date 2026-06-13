# ADR-011: Live Camera Intake as a Second `FrameSource`, on a Separate Demo Page

## Status

Accepted.

## Date

2026-06-10

## Context

ADR-006 placed the frame-source intake (`Frame`, `FrameSource`, `VideoFileSource`)
in `ml/util/` precisely so that "a stored video and a live stream are the same
frame source to downstream consumers." ADR-010 made real-time per-frame live
inference (`iter_live_frames`) the standard demo observation mode. Until now,
however, the only concrete `FrameSource` was a stored-video file — the live half
of the ADR-006 promise was unexercised.

Issue #47 adds the first live source: an iPhone connected to the Mac
(Continuity Camera / USB), consumed by the Streamlit demo. Three cross-cutting
questions had to be settled, each constraining future camera/serving work:

1. **Where does camera intake live, and what is its contract?** A camera differs
   from a file in ways the seam must absorb: no trustworthy fps metadata, no
   seeking, no EOF, and a driver-side buffer that accumulates stale frames when
   inference runs slower than capture.
2. **How does the demo expose a live source whose loop semantics differ from
   file playback?** File playback is finite and must be *paced down* to
   real-time (sleep to clip fps); a camera is infinite and arrives *already* at
   real-time pace — pacing logic applied to it is a bug.
3. **How are cameras selected** when OpenCV can open devices only by integer
   index and cannot report device names?

Fall-classification accuracy is explicitly out of scope (ADR-009 / #25 / #26):
the goal of the live path is that *what the model detects is visible in real
time*, not that the detection is clinically right.

## Decision

**1. `CameraSource` joins `VideoFileSource` in `ml/util/frame_source.py` as the
second implementation of the `FrameSource` Protocol**, with a live-specific
contract:

- **Wall-clock `time_sec`** — `time.monotonic()` elapsed since the first frame,
  because camera fps metadata is unreliable. Downstream temporal logic (e.g.
  `sustained_down_sec`) already keys off `time_sec`, so it works unchanged.
- **Freshest-frame preference** — `CAP_PROP_BUFFERSIZE = 1`, so slow inference
  drops stale frames instead of accumulating latency.
- **No EOF** — the iterator ends only after a bounded run of consecutive read
  failures (device unplugged), never on a frame count.

The pure-OpenCV camera *probe* (`ml/util/camera_probe.py`) lives beside it:
util-level because it is Streamlit-free and unit-testable, same seam layer.

**2. The live camera viewer is a separate Streamlit multipage page**
(`ml/demo/pages/live_camera.py`), not a source switch inside `app.py`. File
playback and camera viewing share the inference/render core (`iter_live_frames`
— untouched) and shared widgets (`demo_ui.py`), but keep separate render loops,
because their loop semantics are disjoint: finite + paced-down vs infinite +
already-real-time.

**3. Camera selection is index-probe + thumbnail**: open indices 0–4, show one
captured frame per opening device, let the user pick visually. No device-name
enumeration, no new dependencies.

## Relationship to other ADRs

- **Fulfils ADR-006; does not change it.** ADR-006 placed the seam in `ml/util/`
  *for* this moment; `CameraSource` is the promised second consumer-facing
  source. The `demo → util` direction and guard test stand.
- **Extends ADR-010.** `iter_live_frames` proved source-agnostic: the live page
  reuses it with zero modification. The pre-render path stays superseded.
- **Bounded by ADR-009.** Classification strategy and accuracy are untouched.

## Alternatives Considered

### A. Source switch inside the existing page (radio: file | camera)

**Rejected.** The render loop would accumulate per-source branches (pacing
on/off, finite/infinite termination, completion messaging) inside one function.
The semantics are disjoint, not parametric — a separate page keeps each loop
honest, and Streamlit multipage makes the split nearly free.

### B. Device-name enumeration via AVFoundation (pyobjc)

**Rejected.** Best UX on paper, but adds a macOS-only dependency, and the
AVFoundation device order is not guaranteed to match OpenCV's capture indices —
a wrong-name-on-right-camera bug waiting to happen. A thumbnail identifies a
camera better than a name, with zero dependencies.

### C. Browser-side camera via streamlit-webrtc

**Rejected (for now).** Solves a problem we don't have — the demo is a local dev
tool (ADR-003) on the same machine as the camera. WebRTC adds a dependency,
TURN/ICE complexity, and a different frame-delivery model. If a remote-browser
camera is ever needed, that is a new decision, not an amendment to this one.

### D. Replace file playback with the camera as the primary mode

**Rejected.** File playback over `ml/data/{domain}/processed/` clips remains
the reproducible path for regression checking and demos without hardware; the
two modes serve different needs and now coexist as sibling pages.

## Consequences

**Positive:**

- The ADR-006 seam is now proven by two heterogeneous sources; future sources
  (RTSP serving intake) have a worked example of which differences belong inside
  a `FrameSource` (timing, buffering, termination) and which stay out (pacing —
  a presentation concern).
- `iter_live_frames` needed zero changes — evidence the ADR-005/010 seam design
  holds.
- Camera selection works for any device OpenCV can open, with no new
  dependencies.

**Negative / Trade-offs:**

- Shared demo widgets had to be extracted to `ml/demo/demo_ui.py`; contributors
  must put page-shared UI there, not in `app.py`.
- Index-probe selection shows thumbnails, not names; with many cameras the user
  must recognize devices visually.
- Wall-clock `time_sec` means camera runs are not frame-reproducible (unlike
  file runs) — acceptable for a live view, but benchmarks must keep using
  `VideoFileSource` injection (`demo/live_bench.py`).
