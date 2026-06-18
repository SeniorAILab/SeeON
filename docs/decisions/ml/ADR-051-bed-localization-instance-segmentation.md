# ADR-051: Bed localization via COCO instance segmentation

## Status

Accepted. Extends ADR-025 (pose framework) and ADR-015 (models root); carries forward the no-hard-cap decision (issue #244). Implements issue #243.

## Date

2026-06-18

## Context

Bed ROIs were localized with COCO **detection** (`yolo26m.pt`, class 59 = bed) and rendered as axis-aligned bounding boxes (issue #100/#239/#244). Under ceiling **fisheye** cameras a bed is a rotated, perspective-distorted quadrilateral; an axis-aligned box wraps it loosely and reads visually as a crude rectangle that bleeds into neighbours. The person is already drawn as a pose skeleton (ADR-025); by user request (issue #243) the bed deserves a shape-accurate representation rather than a box.

## Decision

1. **Bed localization uses COCO instance segmentation** (`yolo26m-seg.pt`, same YOLO26 family, class 59 = bed) instead of bbox-only detection. The runner is `YoloBedSegRunner`.
2. **Each bed carries its mask contour polygon.** The axis-aligned bbox is derived from the mask and remains the source of truth for bed-exit containment — `BedExitMonitor` IoU/containment logic is unchanged. The polygon rides on the contract type (`BoundingBox.polygon`, optional; `None` for person/fall boxes).
3. **The demo overlay renders the bed silhouette polygon** (`cv2.polylines`) instead of a rectangle; a bed without a polygon falls back to a rectangle, so person/fall boxes and detection-only stubs are unaffected.
4. **No hard cap on bed count** (carries issue #244): segmentation instances are deduped by bbox NMS across the seed-frame union, and each surviving box gets the mask polygon of the best-overlapping instance.
5. **Per-frame pose stays a single pass** (ADR-025 / ADR-005 §3): bed segmentation is low-frequency (seed union + sparse re-detect), never per-frame.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Pose/detection framework choice | ADR-025 |
| Model weight root + metadata contract | ADR-015 |
| Bed localization method (detection → segmentation) + mask rendering | ADR-051 |
| No hard cap on bed count | issue #244 |
| Bed-exit policy (containment/grace/sticky assignment) | bed-exit logic (unchanged) |

This ADR does not reopen the pose framework, the model-path layout, or bed-exit policy. It only changes how a bed ROI is localized and represented.

## Alternatives Considered

- **Keep bbox detection.** Loose fit under fisheye; visually a crude rectangle. Rejected by user (issue #243).
- **Oriented bounding box (OBB).** Ultralytics OBB weights are DOTA/aerial and expose no COCO `bed` class — not available off the shelf.
- **Bed keypoint / literal "skeleton" model.** No pretrained bed-corner keypoint weights exist; would require custom corner annotation and training. Deferred — a medial-axis skeleton can be layered on the mask later if desired.
- **Separate mask type vs optional polygon on `BoundingBox`.** Chose an optional `polygon` field so existing IoU/containment and the `BedStatus(box=...)` passthrough keep working with zero churn.

## Consequences

- `BoundingBox` gains an optional `polygon` field (`None` for non-bed boxes).
- Bed weight family is now `yolo26m-seg.pt` (gitignored model cache, ADR-015; `metadata.json` updated). `yolo26m.pt` is retained for reference.
- Counts can differ slightly from the detection weight (different head). Empirically the seg union yields 502호 → 8 beds, 202호 → 4 beds, all rendered as silhouette polygons.
- Remaining limit: COCO segmentation is still out-of-distribution on some fisheye angles (recall) and can over-segment cluttered rooms. Cleaner, exhaustive bed shapes require nursing-home fine-tuning (data-gated, separate effort). See `docs/research/bed-detection-yolo-empirical-audit.md`.
