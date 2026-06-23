---
slug: ml-edge-api-worker-split
status: done
owner: codex
created: 2026-06-23
---

# ML Edge API / Worker Split Spec

## Objective

Run ML edge as two responsibilities inside `ml/`: FastAPI remains the API, readiness,
status, and debug surface; a physically separate `ml/worker` package owns RTSP streams,
model/domain processing, camera heartbeat, and alert publishing.

## Requirements

- FastAPI startup must not run infinite camera loops.
- Production worker code must not live under `ml/serving`; the canonical entrypoint is
  `python -m worker.edge_worker`.
- The worker must load a four-camera config from a gitignored path, with per-camera RTSP
  URL and per-camera ingest credentials.
- Camera config remains JSON/Pydantic and is mounted into the worker service as a Docker
  Compose secret.
- RTSP intake must be a real `FrameSource`, not a scaffold.
- The worker must tolerate one failed/offline camera while the other cameras continue.
- Model/domain processing must run from a scheduler path, not directly in four capture
  threads.
- Four configured cameras must not load four copies of each YOLO model; pose and bed
  runners are created once per worker process and shared through the scheduler path.
- Latest-frame buffering must overwrite stale frames instead of blocking capture threads
  behind old pending frames.
- Events must reuse the existing `/ingest/alerts` and `/ingest/heartbeat` backend APIs.
- Backend camera registration remains the source of truth for camera identity, room/space
  binding, ingest key id, and secret provisioning; implementation must preflight whether
  the current backend exposes a safe plaintext ingest-secret provisioning path before
  documenting an operator flow.
- Verification must include deterministic tests and a hardware-gated four-RTSP smoke path.
- Verification must include Docker Compose rendering and a worker CLI config check.
- Documentation must be repo Markdown only.

## Out Of Scope

- No new backend alert ingress.
- No broker, DeepStream, Triton, Celery, Redis, or Kafka.
- No YAML parser dependency and no GPU Compose/runtime scope in this slice.
- No committed RTSP credentials, ingest secrets, snapshots, or videos.
- No DOCX or Google Docs artifact.
