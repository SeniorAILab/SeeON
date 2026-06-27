# ML Agent Rules

Python/uv edge runtime for fall and bed-exit detection. Root run/boot flow stays in the repository `AGENTS.md`; this file owns only the `ml/` package map and import ladder.

## Package Ladder

Lower layers may import only same-layer or lower-layer packages.

| Layer | Packages | Ownership |
| --- | --- | --- |
| L0 | `contracts`, `features` | Dataclasses, protocols, constants, and pure feature math |
| L1 | `sources`, `runners` | Frame intake, camera probing, model runners, registry, device/warmup |
| L2 | `perception` | Observation construction, tracking, scene state, bed detection, frame windows |
| L3 | `domains` | Domain event interpretation (observation → events) |
| L4 | `events` | Alert/event schemas, publishers, outbox, backend ingest client |
| L5 | `api`, `demo` | FastAPI api and Streamlit developer demo |

`training` is a batch lifecycle package: it may import only `training`, `contracts`, `features`, `sources`, and `runners`.
`worker` is the deployable edge process and owns the live orchestration/state (camera workers, supervisor, scheduler, status/latest-frame/incident, edge-worker config). It composes `sources`, `runners`, `perception`, `domains`, and `events`; it is not a shared library, and there is no `runtime` package.

## Runtime Topology

Use explicit ML runtime names:

- `ml-api` is the FastAPI control/debug/status surface. Its product routes live under `/api/v1`; health probes remain unversioned at `/health/live` and `/health/ready`. It may expose health, status, model inventory, bounded debug predictions, and operator controls.
- `ml-worker` is the long-running stream consumer. It receives camera or gateway-provided RTSP streams, runs model/domain evaluation, and relays facts to local `ml-api` at `/api/v1/relay/*` per ADR-067/029.
- `training` is not a runtime service. It creates and evaluates artifacts that runtime code loads through `runners`.

RTSP direction matters. The worker is not an RTSP server and must not embed a publisher. In development, camera-like RTSP input must come from a real camera/gateway or the external `SeniorAILab/rtsp-generator` CLI; this repo may only accept a configured worker-reachable RTSP URL. Do not add MediaMTX, FFmpeg, file-to-RTSP, or synthetic publisher scripts/commands here. Mock/stub/fake logic belongs in unit/contract test code and must not be presented as E2E evidence. Production worker code consumes configured streams and emits local relay events to `ml-api` under `/api/v1/relay/*`; it does not relay raw frames through FastAPI and does not call backend directly.

Do not add a second FastAPI app to `worker`. If a feature needs HTTP control, keep it in `ml-api` and pass state/config through explicit runtime contracts instead of importing api routes into the worker.

## Layout

```text
ml/
├── contracts/        # L0 contract types and artifact path helpers
├── features/         # L0 pure transforms
├── sources/          # L1 FrameSource implementations and source registry
├── runners/          # L1 model runners and ModelRegistry
├── perception/       # L2 observation builders and tracking state
├── domains/          # L3 domain detectors and DomainRegistry
├── events/           # L4 alert/event schema, publisher, outbox, ingest client
├── api/              # L5 FastAPI gateway: lifespan, routes, debug pipeline, heartbeat-status
├── worker/           # edge worker process + live orchestration/state (camera_worker, supervisor, scheduler, status_store, latest_frame, incident_manager, config)
├── training/         # batch training/evaluation lifecycle
├── demo/             # Streamlit demo harness
└── tests/            # pytest suite and dependency-ladder guard
```

`data`, `models`, caches, and generated outputs are storage/output roots, not agent-rule roots. Packages named `core` and `util` do not exist.

## Global Boundaries

- Keep `contracts` and `features` pure: no I/O, no model loading, no runtime boot.
- Keep worker-owned orchestration/state under `worker`; pass event sinks in by protocol so `api` and `worker` inject their own. No cross-boundary shared state between `ml-api` and `ml-worker` (connection is one-directional relay HTTP facts).
- Keep `api` independent of `training`; api loads trained artifacts through `runners` and api adapters.
- Keep `demo` as a harness. It may render overlays and call api, but production classification belongs in `api`.
- Do not add AGENTS files outside the approved ML allowlist.

## Commands

```bash
uv run --directory ml pytest tests/test_import_dependency_ladder.py
```

## Verification Source

The import ladder is executable in `ml/tests/test_import_dependency_ladder.py`. Update that test before changing the ladder.
