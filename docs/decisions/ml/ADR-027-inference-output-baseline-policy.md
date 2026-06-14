# ADR-027: Inference Output Axis and Comparison Baseline Policy

## Status

Accepted. Supersedes the output-axis and baseline-retention clauses of retired source ADR-005. ADR-005 is intentionally absent from the visible corpus; its exact source body is recoverable from git history and mapped in [the coverage matrix](../README.md#coverage-matrix-for-adr-mece-reorganization).

## Date

2026-06-13

## Context

ADR-005 corrected an important modeling confusion: framework/module choice and rendered output options are orthogonal. It also reversed the initial impulse to delete every bbox-related artifact by keeping real bbox classifiers as comparison baselines while deleting fabricated/fake adapters. These active decisions are independent from both the YOLO26 framework choice and the seam architecture, so they are split here.

## Decision

Model/module identity is distinct from output/rendering options.

- A model module is the framework-backed implementation selected behind the model seam.
- Bbox, pose skeletons, labels, confidence, and similar overlays are output/rendering options over a normalized `DetectionResult`.
- “Bbox” is not itself a model. It is one possible display or emitted field from a model result.

Real comparison baselines are kept; fake model adapters are removed or forbidden.

- Real upstream bbox classifiers and their real artifacts may remain as comparison modules where they are useful as controls.
- Fabricated adapters that invent pose/keypoint state from arbitrary scores are not legitimate model outputs and must not be preserved as production/demo truth.
- Baseline retention exists to make method claims testable, not to keep dead fake paths alive.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Pose framework choice | ADR-025 |
| Frame/model seam contract | ADR-026 |
| Output axis semantics and retained real baselines | ADR-027 |
| Fall classifier strategy over temporal keypoints | ADR-009 |
| Model artifact layout | ADR-015 |

## Alternatives Considered

### Treat bbox/pose/label as separate model families by UI option

Rejected. It collapses rendering choices into model identity and makes downstream code depend on presentation shape rather than normalized inference output.

### Delete all bbox code and artifacts

Rejected. Real bbox classifiers are useful control arms. Deleting them would make “pose is better than bbox” less testable and turn a measured comparison into an assertion.

### Keep fake adapters for demo convenience

Rejected. Fake adapters paint model state that did not come from a model. That violates the fail-fast/no-fake-output direction of the project and misleads reviewers about model behavior.

## Consequences

**Positive:**

- Rendering remains decoupled from model implementation.
- Real baselines remain available for comparison and regression evidence.
- Fake/fabricated outputs stay excluded from truthful ML demos.

**Negative / trade-offs:**

- The demo may carry real legacy comparison modules longer than a pure cleanup pass would prefer.
- Reviewers must distinguish retained real baselines from prohibited fake fallbacks.

## Source mapping

This ADR distills retired source ADR-005's output-axis and baseline-retention policy. The original ADR-005 explanation, control findings, and trade-offs remain recoverable from git history; this ADR carries the current output/baseline clause so the visible corpus stays MECE.
