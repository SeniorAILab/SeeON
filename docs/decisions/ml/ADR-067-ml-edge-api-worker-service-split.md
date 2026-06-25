# ADR-067: ML Edge Worker And API Relay Contract

## Status

Accepted

## Date

2026-06-23

## Context

The edge node runs multiple camera streams and must keep API availability separate from long-running RTSP health. FastAPI is the local health, status, model, debug, and bounded control surface; production camera loops are worker concerns. ADR-057's earlier serving-starts-workers clause mixed those responsibilities and could make API readiness depend on camera stream health.

The egress topology is now also part of this split. The worker creates domain facts from camera input, but it must not hold backend ingest credentials or sign public backend requests. The edge needs one backend-facing process so secrets, HMAC signing, outbox/retry, and public egress policy are centralized and auditable.

## Decision

Run the ML edge node as two cooperating services:

- `ml-worker`: owns RTSP capture, model runners, perception, domain judgment, and event creation. It produces fall, bed-exit, heartbeat, and camera-status facts with camera identity, but has no backend ingest secret and never calls backend `/ingest/*` directly.
- `ml-api`: owns the private/local FastAPI surface and is the edge node's single backend gateway. It receives worker facts over loopback relay endpoints, validates the relay token and camera identity, signs backend ingest requests, and owns outbox/retry state.

The worker-to-api contract is local-only:

- `POST /relay/alerts` for domain alert facts.
- `POST /relay/heartbeat` for worker/camera liveness facts.
- `X-Edge-Relay-Token` authenticates the local worker to `ml-api`.
- Payload camera identity is bound to configured camera identity before `ml-api` signs any backend request.

`ml-api` then maps accepted facts to backend `/ingest/alerts` and `/ingest/heartbeat` according to ADR-029. It is the only edge process that stores backend ingest secrets, derives HMAC signatures, and performs public backend egress.

ADR-057 remains current for frame observation and runtime package contracts not changed here. ADR-068 remains current for portable worker video runtime policy; it must describe the live path as `RTSP -> ml-worker -> ml-api -> backend /ingest/*`.

## References

- [ADR-029: Per-site edge inference with signal-only egress](./ADR-029-edge-inference-deployment-topology.md)
- [ADR-057: FrameObservation runner contracts and edge-runtime package architecture](./ADR-057-frame-observation-runner-contracts-and-edge-runtime-architecture.md)
- [ADR-068: ML edge worker portable video runtime](./ADR-068-ml-edge-worker-portable-video-runtime.md)

## Alternatives Considered

### Worker signs backend ingest directly

Rejected. It gives every worker backend credentials and creates multiple backend-facing code paths. That increases attack surface and makes retry/outbox, key rotation, and camera identity validation harder to audit.

### FastAPI owns camera loops

Rejected. Request/API process availability and RTSP stream health have different lifecycles. Camera failure must be reported as worker status, not as API startup failure.

### Broker-based queue between worker and api

Rejected for this slice. Local loopback relay endpoints are enough for the current edge box and avoid Redis, Celery, Kafka, or another operational dependency. A broker can be reconsidered if local durability or multi-process fan-out outgrows the FastAPI relay.

## Consequences

- Edge deployment has two ML processes with explicit responsibilities.
- Worker code can be reasoned about as inference/domain/event creation only; backend credentials and HMAC signing are absent from the worker boundary.
- `ml-api` becomes the single place for backend ingest secrets, HMAC signing, outbox/retry, and camera identity enforcement.
- Camera config still includes RTSP/domain inputs for the worker, but backend-facing credentials move to `ml-api` configuration.
- Four-RTSP and hardware verification remain separate from deterministic tests when local camera credentials are unavailable.

## Changelog

- 2026-06-25: 프로세스 분리 → worker↔ml-api egress 계약·책임으로 확장(ml-api 단일 backend 관문).
