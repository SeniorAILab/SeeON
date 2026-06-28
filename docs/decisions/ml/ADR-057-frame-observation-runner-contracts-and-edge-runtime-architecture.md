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

1. **Model/domain separation.** `worker/runners/` execute model technology and produce normalized observations. `worker/domains/` interpret observations and never call raw model classes.
2. **Runner contracts.** The fixed model execution contracts are `PoseRunner.predict(frame) -> PoseObservation`, `BedRunner.predict(frame) -> BedObservation`, and `FallWindowRunner.predict(window) -> ModelScore`.
3. **Observation contract.** `DetectionResult` is redesigned into `FrameObservation`, with normalized detections, poses, and regions. `worker/perception` builds shared observations; `worker/domains` consumes those observations.
4. **Model registry.** `ModelRegistry` is introduced now as the task-to-runner, config-driven assembly point. Device selection is resolved once at the `ml-worker` composition root and injected through registry construction. A model swap changes `worker/runners/`, the `models/` artifact, and `configs/` only; it does not change `worker/domains/`, worker orchestration, `events/`, or `api`.
5. **Edge package tree.** The live-ML packages are owned by `worker`: `worker/sources`, `worker/runners`, `worker/perception`, and `worker/domains`. `api` is a pure gateway/status/relay process and is ML-free.
6. **Name-based dependency boundary.** The guard `ml/tests/test_import_dependency_ladder.py` enforces package-name boundaries: `contracts`/`features` are pure foundations; `worker/sources` and `worker/runners` stay below `worker/perception`; `worker/domains` consumes observations; `events` owns relay schemas/clients; `api` and `demo` are surfaces; `training` is special and imports only `contracts` plus `features`.
7. **Worker/api boot order.** `ml-worker` loads config, selects device once, loads and warms registered runners, initializes worker-owned services (`status_store`, `incident_manager`, scheduler), and resolves sources. `ml-api` initializes gateway configuration, heartbeat/status state, and backend Event API egress only; it does not load models or resolve live sources.

This ADR references [ADR-029](./ADR-029-edge-inference-deployment-topology.md) for per-site edge deployment and [ADR-023](../common/ADR-023-ml-backend-prediction-boundary.md) for the ML/backend policy boundary. ML `incident_manager` owns idempotency and cooldown only; backend policy, recipient fan-out, final deduplication, and side effects remain backend-owned.

### Recorded sub-decisions

These sub-decisions are part of this ADR and are guard-enforced by the relayout.

1. **Training runtime severed.** Training may import `contracts`, `features`, and training-local code only. It owns offline pose extraction through `training.pose_extraction`; its runtime contract is the produced model artifact. Training must not import `worker`, `worker/sources`, `worker/runners`, `worker/perception`, `worker/domains`, `events`, `api`, `demo`, `core`, or `util`; api must not import training.
2. **L0 artifact helpers.** `pose_weight_path` and `pose_weight_filename` are pure ADR-015 model-artifact path resolution helpers. They live in `contracts/artifacts.py` at L0 and are consumed by both training and runners.
3. **Stateless-vs-mutable tracking split.** Stateless `iou()` and `greedy_match()` live in `features/geometry.py` at L0. The mutable, track-id-stateful `GreedyIouTracker` lives in `perception/tracker.py`. Offline training evaluation uses a training-local loop over the L0 geometry primitive, so training never imports perception.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Stream/model contract architecture, `FrameObservation` redesign, runner contracts, `ModelRegistry`, worker-owned live-ML package layout, name-based dependency boundary, and worker/api boot order | ADR-057 |
| Production camera worker process ownership and RTSP worker boot order | ADR-067 |
| Frame-intake code placement (historically `ml/sources/`; relocated to `ml/worker/sources/` by #431) plus `ml/contracts/frame.py` | ADR-056 |
| Per-site edge deployment topology and signal-only egress | ADR-029 |
| ML/backend policy boundary and side-effect ownership | ADR-023 |
| ML serving/training lifecycle boundary | ADR-022 |
| Pose/detection framework choice | ADR-025 |
| Inference output baseline policy reviewed against `FrameObservation` | ADR-027 |
| Retired window predict route contract; `/debug/predict/window` removed by #431 | ADR-048 |

This ADR does not reopen deployment topology, backend policy ownership, model framework choice, or frame-intake placement. It owns the ML-internal runtime contract architecture that lets those decisions compose.

## Alternatives Considered

### Keep `DetectionResult` and no registry

Rejected. The ADR-050 shape blocks model swaps because domains would remain coupled to one raw output model and the runtime would have no task-to-runner assembly point. The edge runtime needs shared observations and a registry now.

### Strict training L0-only via a training-local pose runtime

Accepted by #431. Training owns a deliberate `training.pose_extraction` wrapper for offline pose extraction, while `ml-worker` owns the live runner packages. This is intentional, bounded duplication: offline training does not import the live worker runner path, and the contract between training and runtime is the produced model artifact rather than shared runner code.

## Consequences

**Positive:**

- Model swaps are localized to runner implementation, model artifact, and config.
- Domains consume stable observations and stay independent of YOLO/RTMPose/ONNX/VLM-specific APIs.
- Offline and runtime pose execution deliberately diverge: training owns its extractor, `worker` owns runtime runners, and the model artifact is their contract.
- Dependency-ladder and lifecycle guard tests make the architecture enforceable.

**Negative / trade-offs:**

- `ModelRegistry`, runner contracts, and `FrameObservation` add explicit architecture surface area.
- ADR-026 remains visible only as historical record, and ADR-050 is superseded as the active architecture authority.
- Training must stay severed from runtime runner packages and guard-tested to avoid recreating api/training or worker/training coupling.
- The accepted cost is small bounded duplication in exchange for bounded-context separation and no offline-to-runtime package coupling.

## Source mapping

- ADR-050's contract vocabulary remains correct, but its `ModelModule.predict(frame) -> DetectionResult` architecture and no-registry decision are superseded.
- ADR-026's body is preserved as historical record; active stream/model architecture authority is this ADR.
- ADR-029 continues to own the physical edge deployment topology; this ADR owns the internal package and contract architecture that runs on that edge device.

## Changelog

- 2026-06-28: Worker is now the sole live-ML runtime and owns `sources/`, `runners/`, `perception/`, and `domains/` under `ml/worker/`; `api` is an ML-free gateway; device selection is resolved once at the worker composition root and injected through the registry; numeric L0-L5 ladder wording is superseded by the package-name boundary enforced by `ml/tests/test_import_dependency_ladder.py`.
