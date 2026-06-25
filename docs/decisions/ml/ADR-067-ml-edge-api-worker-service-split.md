# ADR-067: Split ML Edge API And Camera Worker Services

## Status

Accepted

## Date

2026-06-23

## Context

The edge node must handle multiple care-home cameras. FastAPI is useful as the local
serving, health, status, and debug API surface, but long-running camera loops and RTSP
failure handling are operational worker concerns. ADR-057 previously allowed serving
startup to run camera workers before reporting readiness, which can block API startup and
mix API availability with camera stream health.

RTSP intake also needs per-camera credentials and backend ingest identity. The existing
singleton demo alert environment variables cannot represent four cameras safely.

## Decision

Run ML edge as two services:

- `ml-api`: FastAPI API service. It loads model/API state, exposes health, status,
  model, and debug routes, and does not own production camera loops.
- `ml-worker`: dedicated worker process. It loads per-camera RTSP and ingest config,
  captures frames, runs the model/domain pipeline, sends heartbeats, and publishes alerts.

The worker uses one capture thread per camera, bounded latest-frame buffers, and one
scheduler/inference loop. This keeps streams fresh while avoiding concurrent model calls
from capture threads.

This ADR supersedes the ADR-057 clause that serving startup starts camera workers before
readiness. ADR-057 remains current for frame observation and runtime package contracts not
changed here.

## Alternatives Considered

### FastAPI BackgroundTasks

Rejected. Request-scoped task machinery is the wrong owner for indefinite camera streams
and makes restart/failure policy ambiguous.

### Uvicorn worker processes own cameras

Rejected. Uvicorn process count is an API serving concern and would duplicate or race
camera ownership.

### Broker-based queue

Rejected for this slice. Four local RTSP streams can be handled in-process without adding
Redis, Celery, Kafka, or another operational dependency.

## Consequences

- Edge deployment has two ML processes instead of one.
- Camera config must be provisioned outside git and passed through `EDGE_CAMERA_CONFIG`.
- FastAPI readiness no longer means all cameras are online; camera health is worker status.
- Four-RTSP verification is hardware-gated and must be reported separately from deterministic
  tests when local camera credentials are unavailable.
