# Runtime Agent Rules

Own L3 edge orchestration: camera workers, scheduling, status, incidents, latest-frame buffers, and edge runtime assembly.

## Local Ownership

- `camera_worker.py`: per-camera frame processing and event-sink emission.
- `edge_worker_supervisor.py`: multi-camera capture/process loop and heartbeats.
- `edge_worker_config.py`: edge camera config validation.
- `edge_runtime.py`: serving-side runtime assembly.
- `camera_manager.py`, `scheduler.py`, `incident_manager.py`, `latest_frame.py`, `status_store.py`: runtime support.

## Imports

Allowed: `contracts`, `features`, `perception`, and local `runtime`.

Forbidden: `domains`, `events`, `serving`, `demo`, `training`, `worker`.

## Focused Tests

- `tests/test_camera_manager.py`
- `tests/test_edge_worker_config.py`
- `tests/test_edge_worker_supervisor.py`
- `tests/test_edge_worker_four_streams.py`
- `tests/test_runtime_latest_frame.py`
- `tests/test_runtime_status_store.py`
- `tests/test_incident_manager.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Do not import `events` here. Accept event sinks by protocol so `serving` and `worker` can inject outbox or ingest clients.
