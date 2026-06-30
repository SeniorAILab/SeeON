# Worker Agent Rules

Own the deployable edge worker: the CLI/process plus the worker-owned live
orchestration and per-camera flow state relocated from the former `runtime`
package by the current worker/API boundary. `ml-worker` reads camera config,
builds shared runners with one composition-root device selection, opens RTSP sources, runs supervisors, creates
alert/heartbeat facts with probability, and relays them to local `ml-api`.

## Local Ownership

- `edge_worker.py`: CLI parsing, config loading, runner bundle construction, per-camera worker construction, supervisor execution, and the local `_RelayClient` to `ml-api`.
- `edge_worker_supervisor.py`: multi-camera capture/process loop and heartbeats.
- `camera_worker.py`: per-camera frame processing and event-sink emission.
- `edge_worker_config.py`: edge camera/domain config validation (`CameraRuntimeConfig`, `EdgeWorkerConfig`, night-window config).
- `scheduler.py`: per-runner frame scheduling.
- `fall_window_classifier.py`: fall window classification wiring.
- `status_store.py`: per-camera liveness/status records (worker-internal flow state).
- `latest_frame.py`: latest-frame buffer (worker-internal).
- `incident_manager.py`: onset/cooldown idempotency gate (worker-internal).

## Imports

Allowed: `contracts`, `features`, `events`, local `worker`, and worker-owned `sources`, `runners`, `perception`, `domains`.

Forbidden: `api`, `demo`, `training`. There is no `runtime` package; import worker-owned modules locally (`from worker.<module> import ...`).

## Focused Tests

- `tests/test_worker_entrypoint.py`
- `tests/test_worker_runner_sharing.py`
- `tests/test_worker_backend_ingest_contract.py`
- `tests/test_edge_worker_cli.py`
- `tests/test_edge_worker_supervisor.py`
- `tests/test_edge_worker_four_streams.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Runner objects are intentionally shared across camera workers. Preserve object identity when changing `_RunnerBundle` or supervisor construction. The worker owns ALL live flow state (status/latest-frame/incident/detector windows); there is no cross-process shared state with `ml-api`. The only worker↔api connection is one-directional relay HTTP facts (`worker -> ml-api /relay/*`); classification probability is produced here and relayed as backend Event API `confidence`.
