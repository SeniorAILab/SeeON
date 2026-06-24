# Worker Agent Rules

Own the deployable edge worker CLI/process that reads camera config, builds shared runners, opens RTSP sources, runs supervisors, and posts ingest events.

## Local Ownership

- `edge_worker.py`: CLI parsing, config loading, runner bundle construction, per-camera worker construction, supervisor execution.

## Imports

Allowed: `contracts`, `sources`, `runners`, `runtime`, `domains`, `events`, and local `worker`.

Forbidden: `serving`, `demo`, `training`.

## Focused Tests

- `tests/test_worker_entrypoint.py`
- `tests/test_worker_runner_sharing.py`
- `tests/test_worker_backend_ingest_contract.py`
- `tests/test_edge_worker_cli.py`
- `tests/test_import_dependency_ladder.py`

## Gotchas

Runner objects are intentionally shared across camera workers. Preserve object identity when changing `_RunnerBundle` or supervisor construction.
