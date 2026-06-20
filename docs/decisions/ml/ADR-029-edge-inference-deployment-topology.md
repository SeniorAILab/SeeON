# ADR-029: Per-site edge inference with signal-only egress

## Status

Accepted. Complements ADR-023 (ML returns signals, backend owns side effects) and ADR-048 (concrete `/debug/predict/window` window contract); does not supersede either. This ADR adds the *deployment topology* clause those ADRs left open: it fixes **where** the pose→classification pipeline runs and **what** crosses the site boundary, which ADR-022/023/048 deliberately do not address.

## Date

2026-06-19

## Context

ADR-022 split ML serving from training, ADR-023 fixed the ML-output vs backend-policy ownership boundary, and ADR-048 fixed the concrete `/debug/predict/window` window contract. None of them decided the physical deployment topology: when this scales to multiple nursing homes, does inference run centrally in the cloud over streamed video, or locally at each site?

The requirement that forces the decision is multi-tenant scale-out. A production site runs several HD CCTV feeds (RTSP) continuously, the alert is safety-critical (a fall must surface in seconds), and the input is resident video — among the most privacy-sensitive data a facility holds. Centralizing inference would mean streaming every site's raw video to a remote GPU fleet 24/7.

The decision is expensive to reverse because it dictates the network transport, the trust boundary, the per-site hardware bill of materials, and the compliance posture. Once edge devices are deployed to sites, changing the topology means a field hardware rollout.

## Decision

Pose extraction **through** classification runs on a per-site edge device. The same device emits the signed fall event to the remote backend; only signed event metadata (kilobytes) leaves the site — **raw video never does**.

- **One device per site, two code responsibilities.** Inference (the serving pipeline: frames → 17-keypoint pose → fall classification) and emit (the thin HMAC-signing client) are separate code paths but co-located on one physical edge box. The separation is logical, for testability and for the dormant backend-pull seam (below) — not a second device.
- **Signal-only egress.** What crosses the site boundary is the signed event defined by the `POST /ingest/alerts` contract (`resident_id`, `facility_id`, `probability`, `detected_at`, `type`), authenticated with per-camera HMAC-SHA256 and a ±5-minute freshness window. Video and full pose streams stay on-premises.
- **ML serving returns signals only.** Consistent with ADR-023, the edge serving runtime computes `fall_probability` / `is_fall` and never dispatches an alert.
- **Backend owns policy.** Deduplication, rate-limiting, freshness, recipient fan-out, and KakaoTalk delivery remain backend-owned, off-site.

### Drivers

- **Latency.** Local inference avoids a cloud round-trip (≈100–500 ms) on a safety-critical path; on-device pose+classification on a Jetson-class accelerator runs in ≈18–26 ms.
- **Bandwidth.** Multiple continuous HD RTSP feeds per site is a sustained multi-megabit-to-gigabit egress problem; signed events are kilobytes per fall.
- **Privacy / compliance.** Resident video never leaving the premises makes the privacy boundary architectural rather than policy-dependent (GDPR/PIPL data-minimization by construction).
- **Cost.** 24/7 cloud GPU inference for every feed is roughly an order of magnitude more expensive than amortized on-prem edge hardware at multi-site scale.

### Evidence

The hybrid edge-inference + central-policy split is the multi-tenant industry standard, not a novel choice. The NotebookLM "요양원 낙상 보호 AI" notebook (127 sources) converges on it, and the reference architectures match: NVIDIA Metropolis/DeepStream runs inference at the edge and hands events to a separate analytics service that owns alarms; AWS Panorama performs on-device CV with IoT Greengrass → IoT Events → SNS for central eventing; Milestone XProtect keeps alarm logic in a separate Event Server from the inference plugin. The YOLOv11-SEFA fall-detection work demonstrates the inference budget is met on a Jetson AGX Orin. Full source list and verbatim API contracts: `background.eldercare_architecture.deployment_topology_decision` and `.data_contracts` in [`.claude/skills/technical-report/technical-report.yaml`](../../../.claude/skills/technical-report/technical-report.yaml).

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Where inference runs (per-site edge) and what crosses the site boundary (signed events, never video) | ADR-029 |
| ML output vs backend product policy/side effects | ADR-023 |
| Concrete `/debug/predict/window` window request/response geometry + retained backend prediction seam | ADR-048 |
| ML-internal serving/training lifecycle and uv dependency-group boundary | ADR-022 |

## Implementation status

Verified in code 2026-06-19. The decision is partially realized; the gap is topology, not capability.

The **live alert path is fully implemented and E2E-verified**: the Streamlit demo acts as the edge-node prototype, extracts pose locally, classifies through real ml-serving HTTP via `serving.client.ServingFallClassifier` → `POST /debug/predict/window`, and pushes the signed event to `POST /ingest/alerts` ([`ml/events/publisher.py`](../../../ml/events/publisher.py)); the backend then applies policy and fans out to KakaoTalk. This already satisfies signal-only egress — the demo sends the event, not video.

Serving now boots through an eager lifespan: config validation, device selection, model registry warmup, runtime services, source resolution, and camera workers. A model-load failure records `model.load_failed` and makes `/health/ready` not-ready while the process stays live; camera failures record `camera.offline` and degrade status without blocking readiness when the model loaded.

The backend carries a **dormant prediction seam** (the D2-O1 owner from ADR-048): `MlServingPredictionAdapter` historically calls `ML_SERVING_URL` + `/predict`; the canonical serving window route is now `/debug/predict/window` (the bare `/predict` alias was removed in the ml/ edge-device relayout, issue #268). `AlertEventsService.ensureOutboxForIngest` does **not** call `predict()` — it trusts the `probability` already in the ingest payload (the edge already classified). The seam is retained, per its own code comment, so "the backend-owned alert policy can consume ML predictions again" if a future topology needs backend-pull; it is not invoked on the current edge-push path. This ADR records that the edge-push topology is the chosen one and the backend-pull seam is a deliberately parked alternative.

What is **not yet built**: deployment of inference onto dedicated per-site edge hardware, and the deferred items below.

## Alternatives Considered

### Central cloud inference over streamed video

- Pros: no per-site hardware; one place to deploy and update models.
- Cons: continuous raw-video egress (bandwidth + cost), cloud round-trip latency on a safety path, and resident video leaving the premises (the compliance blocker).
- Rejected: fails bandwidth, latency, and privacy simultaneously at multi-site scale.

### Backend-pull prediction (backend calls serving `/predict` per event)

- Pros: centralizes the model; the seam already exists in code.
- Cons: requires the inference input (video or pose stream) to reach the backend, reintroducing the egress and privacy problem; adds a network hop to the alert path.
- Rejected for the live path, but **retained as a dormant seam** (ADR-048 D2-O1) rather than deleted, because it is the right extension point if a future deployment co-locates serving with the backend.

### Per-area / per-camera inference devices

- Pros: simplest per-device wiring; no on-box multiplexing.
- Cons: device count and operational overhead scale with cameras, not sites.
- Deferred, not rejected — see device sizing below.

## Consequences

**Positive:**

- The privacy boundary is architectural: raw video staying on-site is a property of the topology, not a policy that can be misconfigured.
- The alert path stays within the latency budget without a cloud GPU fleet.
- ADR-023/048 ownership and contract hold unchanged; this is purely a placement decision layered on top.

**Negative / trade-offs:**

- Per-site edge hardware is a field-deployed fleet to provision, monitor, and update — a real operational cost the cloud option avoids.
- Model updates must reach edge devices rather than a single cloud deployment.
- The demo now exercises the over-the-network `/debug/predict/window` edge path; dedicated per-site edge hardware deployment remains unbuilt.

**Deferred (future ADRs / plans):**

- **Edge device sizing** — one box per site batching multiple RTSP feeds vs per-area devices.
- **Multi-site transport** — the industry-standard MQTT/TLS (QoS 1) broker pattern vs the current HMAC `POST`; revisit when site count makes per-event HTTP connection cost matter.
- **VMS layer + edge local video storage** — currently absent; needed for review/forensics without breaking signal-only egress.
- **Event idempotency key** — to make retried/duplicated edge emits safely deduplicable at ingest.
