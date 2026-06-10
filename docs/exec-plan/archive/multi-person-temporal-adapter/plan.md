```yaml
slug: multi-person-temporal-adapter
issue: "#46"
status: done
date: 2026-06-10
author: claude-fable-5
```

# Multi-person temporal fall classification in the demo adapter

## Problem

`TemporalFallClassifierModule.predict` (ml/demo/temporal_module.py) is single-person:
it feeds `normalize_person_keypoints(pose.keypoints, ...)` — which picks `person[0]` —
into ONE ring buffer, and emits only `pose.boxes[0]` / `pose.keypoints[0]`. With two or
more people in frame, (a) every person except the first is invisible in the overlay,
and (b) the buffer interleaves keypoints from whoever YOLO happens to rank first each
frame, corrupting the temporal window the classifier sees.

## Decision: greedy-IoU tracker in the demo layer (not ultralytics track)

`ModelModule.predict(frame) -> DetectionResult` is a per-frame seam with no track-id
field, and `YoloPoseRunner` uses `model.predict` (stateless). Switching to ultralytics
`model.track` would force track ids through `seam.py`, `yolo_runtime.py`, and
`model_modules.py` — a cross-cutting seam change for what is a demo-layer concern.
Instead: a small, pure, unit-testable greedy IoU tracker inside the demo package that
associates this frame's person boxes with persistent track ids. Same input
(`DetectionResult` from the pose module), no seam change, no new deps.

## Design

### 1. `ml/demo/tracking.py` — new, pure module

- `iou(a: BoundingBox, b: BoundingBox) -> float`
- `class GreedyIouTracker`:
  - `update(boxes: tuple[BoundingBox, ...]) -> tuple[int, ...]` — returns one track id
    per input box, index-aligned.
  - Association: compute all (track, box) IoU pairs, sort descending, greedily match
    pairs with IoU >= `min_iou` (default 0.3); unmatched boxes get fresh ids.
  - Tracks not matched this frame accumulate `misses`; evicted when `misses > max_misses`
    (default 30 frames ≈ 1 s at 30 fps). A track's `last_box` is kept for matching
    while it is missed.
- No numpy/ultralytics imports — plain dataclasses + tuples, fully unit-testable.

### 2. `TemporalFallClassifierModule` — per-track buffers

State changes:
- `self._buf: deque` → `self._buffers: dict[int, deque[NDArray[np.float32]]]`
  (one ring buffer per track id, each `maxlen=window`)
- `self._last_prob: float` → `self._last_probs: dict[int, float]`
- new `self._tracker = GreedyIouTracker()`

`predict` flow per frame:
1. `pose = self._pose.predict(frame)` (unchanged — one YOLO call).
2. `track_ids = self._tracker.update(pose.boxes)`.
3. For each detected person i: normalize via
   `normalize_person_keypoints((pose.keypoints[i],), frame_w, frame_h, config.CONF_THRESHOLD)`
   — pass a 1-tuple so the SAME training-pipeline function applies per person
   (anti-skew preserved; person[0] of a 1-tuple is exactly that person).
4. Tracks alive in the tracker but unmatched this frame get an all-zeros (17, 3) frame
   appended — mirrors training's zero convention for missing detections, keeps windows
   temporally contiguous.
5. Buffers whose track id was evicted are dropped (`dict` keys pruned to live tracks).
6. Stride trigger unchanged (`frame_counter % stride == 0`); for each FULL buffer build
   its window, stack all due windows into one batch
   (`features` mode: [N, 45]; `sequence` mode: [N, W, 51]) and call `predict_proba` once.
7. Per-person label: `prob = self._last_probs.get(tid, 0.0)` (warm-up = 정상, 0.0),
   `is_fall = prob >= operating_threshold`, text "낙상"/"정상".
8. Emit ALL people: `boxes=pose.boxes`, one `DetectionLabel` per box (index-aligned),
   `keypoints=pose.keypoints`. Empty frame → `DetectionResult()` as today (zeros are
   still appended to missed live tracks first).

Downstream already copes: `current_playback_status` uses `any(label.is_fall ...)` and
`iter_live_frames` uses `max(label.confidence ...)` — no changes needed in
live_view.py / playback_status.py / yolo_overlay.py.

### 3. Tests

- `ml/tests/test_demo_tracking.py`: iou math; id stability across overlapping frames;
  fresh id for non-overlapping box; miss-then-recover keeps id within `max_misses`;
  eviction after `max_misses`; two crossing people keep distinct ids on greedy best-match.
- `ml/tests/test_demo_temporal_module.py` (extend): fake pose module scripting two
  people; assert per-person labels (person A falls → label[A].is_fall, label[B] 정상);
  assert all boxes/keypoints pass through; zero-fill on missed frames; buffer eviction;
  warm-up labels 정상 with confidence 0.0; existing single-person tests stay green.

## Steps

1. Commit this plan (finalize).
2. `ml/demo/tracking.py` + `ml/tests/test_demo_tracking.py`.
3. Rewrite `TemporalFallClassifierModule.predict` + state; extend temporal tests.
4. `cd ml && uv run ruff check . && uv run pytest -q` green.
5. PR → merge → restart Streamlit from main checkout (user directive).

## Non-goals

- Seam/track-id changes to `seam.py` / `yolo_runtime.py` / `model_modules.py`.
- Re-identification after long occlusion (beyond IoU + TTL).
- Rule-based classifier path (single-person rule path untouched).
- UI changes (#57, #58 — separate work).
