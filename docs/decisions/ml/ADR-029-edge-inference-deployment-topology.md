# ADR-029: Per-site edge inference with signal-only egress

## Status

Accepted

## Date

2026-06-19

## Context

ADR-022 split ML serving from training, ADR-023 fixed the ML-output vs backend-policy ownership boundary, and ADR-048 fixed the concrete `/debug/predict/window` window contract. None of them decided the physical deployment topology: when this scales to multiple nursing homes, does inference run centrally in the cloud over streamed video, or locally at each site?

The requirement that forces the decision is multi-tenant scale-out. A production site runs several HD CCTV feeds continuously, the alert is safety-critical, and the input is resident video. Centralizing inference would stream every site's raw video to a remote GPU fleet 24/7.

The edge node is now split by ADR-067: `ml-worker` owns RTSP/inference/domain event creation, and `ml-api` is the only backend-facing edge process. This ADR owns the site-boundary contract between that edge gateway and the remote backend.

## Decision

Pose/person/bed perception, fall classification, and bed-exit domain judgment run on a per-site edge device. Raw video and full pose streams stay on-premises.

The only edge-to-backend path is:

```text
ml-api -> backend /api/v1/events
```

`ml-api` posts no-HMAC event and heartbeat facts to backend `POST /api/v1/events` and `POST /api/v1/events/heartbeat` through the single `API_BACKEND_EVENTS_URL` setting. Camera HMAC credentials and `Camera.ingestMode` are removed. `ml-worker` reaches the backend only indirectly through the local `/api/v1/relay/*` contract in ADR-067.

Backend remains the product-policy owner. Deduplication, rate limiting, recipient fan-out, dashboard read models, Kakao delivery, and alert lifecycle state are backend decisions. ML emits signals/facts only; it does not decide notification policy.

### Drivers

- **Latency.** Local inference avoids a cloud round-trip on a safety-critical path.
- **Bandwidth.** Multiple continuous HD RTSP feeds per site are a sustained egress problem; event facts are kilobytes.
- **Privacy / compliance.** Resident video never leaving the premises makes data minimization architectural.
- **Attack surface.** Exactly one backend-facing edge process keeps Event API egress policy centralized.
- **Cost.** 24/7 cloud GPU inference for every feed is materially more expensive than amortized on-prem edge hardware at multi-site scale.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| Per-site edge topology and `ml-api -> backend /api/v1/events` site-boundary contract | ADR-029 |
| Worker ↔ ml-api relay contract and process responsibilities | ADR-067 |
| ML output vs backend product policy/side effects | ADR-023 |
| Concrete `/debug/predict/window` window request/response geometry + retained backend prediction seam | ADR-048 |
| ML-internal serving/training lifecycle and uv dependency-group boundary | ADR-022 |

## References

- [ADR-023: ML/backend prediction boundary](../common/ADR-023-ml-backend-prediction-boundary.md)
- [ADR-067: ML Edge Worker And API Relay Contract](./ADR-067-ml-edge-api-worker-service-split.md)

## Implementation status

Verified in code 2026-06-19 for edge inference and backend-owned ingest policy. The current topology is being updated so the worker no longer signs backend ingest directly; `ml-api` becomes the single backend gateway per ADR-067.

The backend Event API accepts no-HMAC event and heartbeat facts and applies backend-owned state changes. The dormant backend-pull prediction seam remains parked: `AlertEventsService.ensureOutboxForIngest` trusts the probability already present in the ingest payload and does not call prediction on the current edge-push path.

Dedicated per-site hardware deployment and later multi-site transport hardening remain future work.

## Alternatives Considered

### Central cloud inference over streamed video

Rejected. It fails bandwidth, latency, and privacy simultaneously at multi-site scale.

### Worker signs backend ingest directly

Rejected. It violates the single backend-facing edge gateway rule, distributes backend credentials into the worker, and expands the public egress attack surface.

### Backend-pull prediction

Rejected for the live path because it requires inference input to reach backend-side serving or adds a network hop to the alert path. The seam is retained as a parked alternative for a future topology that co-locates serving with the backend.

### Per-area / per-camera inference devices

Deferred, not rejected. It may simplify wiring, but device count and operational overhead scale with cameras rather than sites.

## Consequences

**Positive:**

- Raw video staying on-site is a property of the topology, not a policy setting.
- The alert path stays within the latency budget without a cloud GPU fleet.
- Backend Event API egress is concentrated in `ml-api`.
- ADR-023 ownership remains intact: backend owns policy and delivery; ML owns signal generation.

**Negative / trade-offs:**

- Per-site edge hardware is a fleet to provision, monitor, and update.
- Model updates must reach edge devices rather than one cloud deployment.
- `ml-api` now carries gateway responsibilities and needs relay-token, single-URL Event API egress, outbox, and retry hardening.

**Deferred (future ADRs / plans):**

- Edge device sizing — one box per site batching multiple RTSP feeds vs per-area devices.
- Multi-site transport — MQTT/TLS QoS 1 vs current no-HMAC HTTPS `POST` when site count warrants it.
- VMS layer + edge local video storage for review/forensics without breaking signal-only egress.

## Changelog

- 2026-06-25: ml-api를 edge→backend 단일 관문으로 명시하고, HMAC/outbox/ingest secret 소유와 worker 직접 egress 금지를 반영.
- 2026-06-27: issue #388 cutover supersedes the HMAC ingest decision: live edge egress is no-HMAC `POST /api/v1/events` plus `/heartbeat` via `API_BACKEND_EVENTS_URL`; camera HMAC credentials and `Camera.ingestMode` are removed.
