# ADR-056: ML frame intake and source package layout

## Status

Accepted. Supersedes ADR-006.

Implementation status: planned; realized in Slices 1, 3, 11 of the ml/ edge-device relayout (issue #268).

## Date

2026-06-20

## Context

ADR-006 moved frame-source intake from `ml/demo/` to `ml/util/` because serving/realtime reuse was already intended, but not yet present as a second real consumer. It deliberately rejected a top-level package as YAGNI: the intake surface was still a single shared module, and the model contract still had only the demo as a consumer.

The edge-device relayout changes those premises. `ml/util/` is dismantled entirely, and the second consumer now exists: the edge runtime loop and serving path need the same video-file, webcam, and future RTSP intake as the demo and training support code. Keeping intake in `util/` would preserve a package whose only reason for existence has expired.

This ADR is a code-placement successor. It does not redesign the stream/model contract itself; that authority moves to [ADR-057](./ADR-057-frame-observation-runner-contracts-and-edge-runtime-architecture.md).

## Decision

Frame-source intake moves to a top-level `ml/sources/` package.

Concretely:

1. `VideoFileSource`, `CameraSource`, webcam intake, the RTSP scaffold, and source registry live under `ml/sources/`.
2. The `Frame` data type and `FrameSource` Protocol are stream contracts and live in `ml/contracts/frame.py` at dependency-ladder rank L0.
3. `ml/util/` is removed in this cycle. There is no permanent compatibility shim.
4. Demo, serving, training, and the edge runtime import `sources` and `contracts.frame`; they never import `util`.

The dependency direction is guard-tested by the relayout: `sources/` is an L1 package that may depend on L0 contracts/features but not on higher runtime, domain, event, serving, demo, or training packages. The guard test `test_dependency_ladder_direction` enforces that placement.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Frame-intake code placement (`ml/sources/` plus `ml/contracts/frame.py`) | ADR-056 |
| Stream/model contract architecture, observation redesign, runner contracts, and registry | ADR-057 |
| Pose/detection framework choice | ADR-025 |
| Live camera as a concrete source | ADR-011 |
| Per-site edge deployment topology | ADR-029 |

This ADR owns frame-intake code placement only. It does not reopen the model framework, the edge deployment topology, live-camera product behavior, or the stream/model contract architecture.

## Alternatives Considered

### Keep intake in `ml/util/`

Rejected. `ml/util/` is dismantled by the edge-device relayout. Keeping frame intake there would turn a temporary shared bucket into a permanent architectural dependency after its YAGNI justification has been invalidated.

### Use a single shared module instead of a package

Rejected. The intake surface now has multiple source types and a registry: video file, webcam, RTSP scaffold, and serving/runtime resolution. A package boundary is justified now and keeps source-specific implementations separate from the L0 stream contract.

## Consequences

**Positive:**

- Serving, runtime, demo, and training reuse one real frame-intake path without importing from `demo/` or `util/`.
- The L0 `contracts.frame` contract is separated from L1 source implementations, so higher packages depend on the stream contract without depending on OpenCV/source mechanics.
- Dependency-ladder guard tests make the intended direction mechanical rather than advisory.

**Negative / trade-offs:**

- One more top-level ML package exists (`ml/sources/`).
- ADR-006 becomes historical: its motivation is preserved, but its `ml/util/` placement is no longer current authority.

## Source mapping

- ADR-006's reason for leaving `demo/` still stands: production serving/runtime must not depend on demo code.
- ADR-006's YAGNI rejection of a top-level package no longer stands because the second consumer and multi-source registry now exist.
- The active successor placement is `ml/contracts/frame.py` for the stream contract and `ml/sources/` for source implementations.

## Changelog

- 2026-06-28: `sources/` (plus `runners/`, `perception/`, and `domains/`) now live under `ml/worker/`; worker owns live ML, and the top-level placement described in this ADR is superseded by #431.
