# ADR-050: Frame and Model Contract Architecture

## Status

Accepted. Supersedes ADR-026 terminology: seam → contract. Superseded by ADR-057 (ml/ edge-device relayout, issue #268): the model contract becomes `FrameModel`/`PoseRunner`/`BedRunner` producing `FrameObservation` (with `WindowModel`/`FallWindowRunner` → `ModelScore`), a `ModelRegistry` is introduced, and `DetectionResult` is superseded by `FrameObservation`. Body preserved as historical record.

## Date

2026-06-18

## Context

ADR-026 preserves the retired ADR-005 architecture that keeps frame intake and model output behind two small integration boundaries. The architecture is still correct, but the term "seam" has become ambiguous project jargon. By user decision, the active vocabulary is now **contract** / **계약**.

This ADR is a terminology successor, not a redesign. The public symbols stay unchanged: `FrameSource`, `ModelModule`, `DetectionResult`, `DetectionLabel`, and `BoundingBox` are contract types, not names that need renaming.

## Decision

The ML inference path is structured around two minimal contracts:

1. **Stream contract — `FrameSource`.** Stored video files, live cameras, and future RTSP sources are presented downstream as one iterator of `Frame`s. Model code should not branch on whether frames originated from a file, camera, or future stream source.
2. **Model contract — `ModelModule.predict(frame) -> DetectionResult`.** A model module turns one frame into a normalized detection result. Renderers and downstream consumers depend on the normalized result shape, not on raw framework-specific result objects.

The contracts are intentionally minimal: Protocol-style boundaries and normalized data shapes, not a full plugin registry. A registry can be introduced later only when multiple independently maintained model modules justify it.

The temporal fall classifier sits above the per-frame model contract. `ModelModule` emits per-frame detections/keypoints; the temporal layer decides fall state over a window and is governed by classifier/training ADRs.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Pose/detection framework choice | ADR-025 |
| Frame-source intake code placement in `ml/util/` | ADR-006 |
| Stream/model contract architecture and active terminology | ADR-050 |
| Live camera as a second `FrameSource` | ADR-011 |
| Demo observation mode | ADR-010 |
| Classifier content over keypoint sequences | ADR-009 |

This ADR does not reopen framework choice, code placement, demo UX, classifier content, or inference output semantics. It only renames the architecture vocabulary from seam to contract and carries forward the same architectural boundary.

## Alternatives Considered

### Keep "seam" as the active term

Rejected. It is now project-specific jargon with unclear meaning for new contributors. "Contract" is clearer because the architecture is about stable Protocol-style interfaces and normalized data shapes.

### Rename public symbols to include `Contract`

Rejected. The existing public symbols already describe the domain (`FrameSource`, `ModelModule`, `DetectionResult`, `DetectionLabel`, `BoundingBox`). Renaming them would churn code without improving the API.

### Introduce a full plugin/contract registry now

Rejected as premature. ADR-026's YAGNI reasoning still applies: a registry adds surface area before there are multiple independently maintained model modules.

## Consequences

**Positive:**

- Current documents and future work use one clearer term: contract / 계약.
- The architecture keeps the same small boundary while avoiding the ambiguous "seam" label.
- Code symbols and runtime behavior remain stable; this is a documentation/API-language change, not a functional migration.

**Negative / trade-offs:**

- Historical ADRs and older plans still contain the word "seam" as archival record.
- Readers may briefly see both terms while moving between ADR-026 history and ADR-050 current authority.

## Source mapping

- `seam` is a retired term for the active architecture vocabulary.
- ADR-026 remains a historical record and is not rewritten; this ADR supersedes its terminology only.
- Retired source ADR-005 remains recoverable from git history and continues to be mapped through the coverage matrix. The active architecture clause formerly named by ADR-026 is now carried forward here as the stream/model contract architecture.
