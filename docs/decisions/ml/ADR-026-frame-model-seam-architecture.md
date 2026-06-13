# ADR-026: Frame and Model Seam Architecture for ML Inference

## Status

Accepted. Supersedes the two-seam architecture clauses of [ADR-005](./ADR-005-yolo26-pose-and-module-seam.md). ADR-005 remains as the preserved historical source record.

## Date

2026-06-13

## Context

ADR-005 selected both a pose framework and a module architecture. The framework choice can change independently from the seam architecture: YOLO26-pose could be replaced behind the same seam, or the seam could be promoted without changing the current framework. To make the active ADR corpus MECE, this ADR owns only the seam architecture.

## Decision

The ML inference path is structured around two minimal seams:

1. **Stream seam — `FrameSource`.** Stored video files and live streams are presented downstream as one iterator of `Frame`s. Model code should not branch on whether frames originated from a file, camera, or future RTSP source.
2. **Model seam — `ModelModule.predict(frame) -> DetectionResult`.** A model module turns one frame into a normalized detection result. Renderers and downstream consumers depend on the normalized result shape, not on raw framework-specific result objects.

The seams are intentionally minimal: Protocol-style contracts and normalized data shapes, not a full plugin registry. A registry can be introduced later only when multiple independently maintained model modules justify it.

The temporal fall classifier sits above the per-frame model seam. `ModelModule` emits per-frame detections/keypoints; the temporal layer decides fall state over a window and is governed by classifier/training ADRs.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Pose/detection framework choice | ADR-025 |
| Stream seam and model seam architecture | ADR-026 |
| Frame-source intake code placement in `ml/util/` | ADR-006 |
| Live camera as a second `FrameSource` | ADR-011 |
| Demo observation mode | ADR-010 |
| Classifier content over keypoint sequences | ADR-009 |

## Alternatives Considered

### Separate ingestion code for stored video and live streams

Rejected. File and live sources would drift and duplicate downstream assumptions. The key architectural insight is that downstream model code consumes frames, not source types.

### Full model plugin framework now

Rejected as premature. A registry, entry points, and abstract base class hierarchy would add surface area before the project has multiple independently authored model modules.

### Couple renderers to raw framework output

Rejected. Raw framework objects make the UI and downstream processing brittle to framework swaps. `DetectionResult` keeps framework-specific details behind the module boundary.

## Consequences

**Positive:**

- File, camera, and future RTSP paths can share inference/rendering code.
- Framework swaps are localized to model modules.
- The architecture stays small enough for PoC while still preventing obvious coupling.

**Negative / trade-offs:**

- Protocol/convention enforcement is weaker than a registry or contract-test suite.
- Contributors must understand that model choice and render output options are different axes.

## Source preservation

This ADR preserves the seam architecture from ADR-005. ADR-005 remains intact as the historical source for the original combined framework/seam decision.
