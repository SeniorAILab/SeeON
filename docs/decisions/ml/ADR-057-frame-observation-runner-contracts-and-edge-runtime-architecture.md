# ADR-057: FrameObservation runner contracts and edge-runtime package architecture

## Status

Accepted; boot-order worker ownership partially superseded by ADR-067. Supersedes ADR-050 and the active architecture of ADR-026 (ADR-026 body preserved as historical record).

Implementation status: planned; realized in Slices 1, 4, 5a, 5b, 6, 7, 8, 9, 10, 11 of the ml/ edge-device relayout (issue #268).

## Date

2026-06-20

## Context

ADR-050 carried forward ADR-026's stream/model contract architecture with clearer vocabulary: `FrameSource` as the stream contract and `ModelModule.predict(frame) -> DetectionResult` as the model contract. It explicitly deferred a registry because there was not yet more than one independently maintained model family.

The edge-device relayout changes that premise. The runtime must support model/domain separation so model families can change — YOLO, RTMPose, ONNX, VLM, or later runners — without changing domain detectors, runtime scheduling, events, or serving assembly. The second-model-family justification that ADR-050 deferred is now met, so the registry and observation redesign land now.

This ADR is the architecture successor for ML runtime contracts. ADR-026 remains visible as historical record, but its active two-seam architecture is superseded here.

## Decision

The ML edge runtime is organized around model/domain separation and fixed runner contracts.

1. **Model/domain separation.** `runners/` execute model technology and produce normalized observations. `domains/` interpret observations and never call raw model classes.
2. **Runner contracts.** The fixed model execution contracts are `PoseRunner.predict(frame) -> PoseObservation`, `BedRunner.predict(frame) -> BedObservation`, and `FallWindowRunner.predict(window) -> ModelScore`.
3. **Observation contract.** `DetectionResult` is redesigned into `FrameObservation`, with normalized detections, poses, and regions. Perception code builds shared observations; domains consume those observations.
4. **Model registry.** `ModelRegistry` is introduced now as the task-to-runner, config-driven assembly point. A model swap changes `runners/`, the `models/` artifact, and `configs/` only; it does not change `domains/`, `runtime/`, `events/`, or `serving/`.
5. **Edge package tree.** The ML edge tree has nine runtime packages: `contracts`, `features`, `sources`, `runners`, `perception`, `domains`, `runtime`, `events`, and `serving`. `serving` assembles the app factory, lifespan, routes, registry, runtime services, and health/status/debug surface.
6. **Dependency ladder.** L0 is `contracts` and `features`; L1 is `sources` and `runners`; L2 is `perception`; L3 is `domains` and `runtime`; L4 is `events`; L5 is `serving`. `training` and `serving` remain separated: serving does not import training.
7. **Serving/lifespan boot order.** Serving loads config, selects device, loads and warms registered runners, initializes runtime services (`status_store`, `incident_manager`, outbox, publisher seam), and resolves sources. Model load failure makes readiness not ready; source failure is camera-degraded; config failure aborts boot. Production camera workers are owned by the dedicated worker process defined in ADR-067.

This ADR references [ADR-029](./ADR-029-edge-inference-deployment-topology.md) for per-site edge deployment and [ADR-023](../common/ADR-023-ml-backend-prediction-boundary.md) for the ML/backend policy boundary. ML `incident_manager` owns idempotency and cooldown only; backend policy, recipient fan-out, final deduplication, and side effects remain backend-owned.

### Recorded sub-decisions

These sub-decisions are part of this ADR and are guard-enforced by the relayout.

1. **Training-to-runners narrow exception.** Training may import `contracts`, `features`, `sources`, `runners`, and training-local code only. The exception exists for offline pose execution through the single `runners.yolo_pose` path. Training must not import `perception`, `domains`, `runtime`, `events`, `serving`, `demo`, `core`, or `util`; serving must not import training.
2. **L0 artifact helpers.** `pose_weight_path` and `pose_weight_filename` are pure ADR-015 model-artifact path resolution helpers. They live in `contracts/artifacts.py` at L0 and are consumed by both training and runners.
3. **Stateless-vs-mutable tracking split.** Stateless `iou()` and `greedy_match()` live in `features/geometry.py` at L0. The mutable, track-id-stateful `GreedyIouTracker` lives in `perception/tracker.py`. Offline training evaluation uses a training-local loop over the L0 geometry primitive, so training never imports perception.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Stream/model contract architecture, `FrameObservation` redesign, runner contracts, `ModelRegistry`, edge-runtime package layout, dependency ladder, and API serving/lifespan boot order | ADR-057 |
| Production camera worker process ownership and RTSP worker boot order | ADR-067 |
| Frame-intake code placement (`ml/sources/` plus `ml/contracts/frame.py`) | ADR-056 |
| Per-site edge deployment topology and signal-only egress | ADR-029 |
| ML/backend policy boundary and side-effect ownership | ADR-023 |
| ML serving/training lifecycle boundary | ADR-022 |
| Pose/detection framework choice | ADR-025 |
| Inference output baseline policy reviewed against `FrameObservation` | ADR-027 |
| Window predict route contract; route becomes `/debug/predict/window` | ADR-048 |

This ADR does not reopen deployment topology, backend policy ownership, model framework choice, or frame-intake placement. It owns the ML-internal runtime contract architecture that lets those decisions compose.

## Alternatives Considered

### Keep `DetectionResult` and no registry

Rejected. The ADR-050 shape blocks model swaps because domains would remain coupled to one raw output model and the runtime would have no task-to-runner assembly point. The edge runtime needs shared observations and a registry now.

### Strict training L0-only via a training-local pose runtime

Rejected. That would either wrap deleted `core` code or duplicate runner logic inside training. The narrow training-to-runners exception keeps one pose-execution path and remains compatible with the AC2 dependency guard because training still avoids perception, domains, runtime, events, serving, demo, core, and util.

## Consequences

**Positive:**

- Model swaps are localized to runner implementation, model artifact, and config.
- Domains consume stable observations and stay independent of YOLO/RTMPose/ONNX/VLM-specific APIs.
- Offline and runtime pose execution share one runner path instead of diverging.
- Dependency-ladder and lifecycle guard tests make the architecture enforceable.

**Negative / trade-offs:**

- `ModelRegistry`, runner contracts, and `FrameObservation` add explicit architecture surface area.
- ADR-026 remains visible only as historical record, and ADR-050 is superseded as the active architecture authority.
- The training-to-runners exception must remain narrow and guard-tested to avoid recreating serving/training coupling.

## Source mapping

- ADR-050's contract vocabulary remains correct, but its `ModelModule.predict(frame) -> DetectionResult` architecture and no-registry decision are superseded.
- ADR-026's body is preserved as historical record; active stream/model architecture authority is this ADR.
- ADR-029 continues to own the physical edge deployment topology; this ADR owns the internal package and contract architecture that runs on that edge device.
