---
slug: ml-edge-api-worker-split
status: done
owner: codex
created: 2026-06-23
---

# ML Edge API / Worker Split Plan

Canonical execution plan distilled from `.omo/plans/ml-edge-api-worker-split.md` and
the follow-up `.omo/plans/ml-edge-worker-service-hardening.md` plan.

1. Record the API/worker architecture decision and docs before code changes.
2. Implement `RTSPSource` with OpenCV-backed latest-frame semantics and tests.
3. Add worker config parsing for per-camera RTSP URLs and ingest credentials.
4. Add per-camera ingest client support for alert and heartbeat endpoints.
5. Add a worker supervisor with capture threads, latest-frame buffers, one scheduler loop,
   per-camera status, and graceful stop.
6. Move the canonical worker entrypoint to `ml/worker/edge_worker.py` and keep any
   `serving.edge_worker` module as compatibility-only.
7. Share pose and bed runners once per worker process; do not create one YOLO runner set
   per camera.
8. Make `LatestFrameBuffer` overwrite stale pending frames without unbounded buffering.
9. Split edge packaging into independent API and worker services, with camera config
   mounted through Compose `secrets` only into the worker service.
10. Preflight backend ingest-secret provisioning before documenting the operator setup
    flow; keep room-centric optional `resident_id` semantics.
11. Add deterministic four-stream tests, a standalone synthetic four-RTSP fixture
    script, and a hardware-gated four-RTSP smoke script.
12. Update API docs, runbooks, ADR index, and remove live-looking RTSP credentials from docs.

## Verification

- `uv run --directory ml pytest tests/test_sources_rtsp.py`
- `uv run --directory ml pytest tests/test_edge_worker_config.py tests/test_events_ingest_client.py`
- `uv run --directory ml pytest tests/test_edge_worker_supervisor.py tests/test_edge_worker_cli.py`
- `uv run --directory ml pytest tests/test_edge_worker_four_streams.py`
- `uv run --directory ml pytest tests/test_worker_entrypoint.py tests/test_worker_runner_sharing.py tests/test_runtime_latest_frame.py`
- `uv run --directory ml pytest tests/test_serving_health.py tests/test_serving_status.py tests/test_serving_api.py`
- `EDGE_CAMERA_CONFIG=./ml/config/edge-cameras.example.json docker compose -f compose.edge.yaml config`
- `uv run --directory ml python -m worker.edge_worker --config config/edge-cameras.example.json --check-config`
- `scripts/ml-edge-four-mock-rtsp-e2e.sh`
- `scripts/ml-edge-four-rtsp-smoke.sh` when `/tmp/eldercare-edge-four-rtsp.json` is available
