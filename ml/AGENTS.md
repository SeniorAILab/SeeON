# ML Agent Rules

Python/uv edge runtime for fall and bed-exit detection. Root run/boot flow stays in the repository `AGENTS.md`; this file owns only the `ml/` package map and import ladder.

## Package Boundaries

Package boundaries are name-based and enforced by `ml/tests/test_import_dependency_ladder.py`.

| Package | Ownership |
| --- | --- |
| `contracts`, `features` | Dataclasses, protocols, constants, and pure feature math |
| `artifact_metadata` | Model artifact metadata schema, read-side only; may import only itself |
| `events` | Alert/event schemas, publishers, outbox, backend ingest client |
| `api` | FastAPI gateway/status/relay only; ML-free except contracts + `events.edge_ingest_client` |
| `worker/sources`, `worker/runners` | Frame intake, camera probing, model runners, registry, device/warmup |
| `worker/perception` | Observation construction, tracking, scene state, bed detection, frame windows |
| `worker/domains` | Domain event interpretation (observation → events) |
| `demo` | Streamlit developer demo harness |

Training moved to eldercare-dataset-ops (ADR-0004); this repo no longer carries a `training` package. `artifact_metadata` is the read-side remnant: a self-contained schema shim (`ModelMetadata`, `CATALOG`, `artifact_dir`/`save_metadata`/`load_metadata`) so `demo` can still load `metadata.json` out of `ml/models/fall/*` at runtime. It must stay in lockstep with dataset-ops's `training/metadata.py` — enforced by `ml/tests/test_vendor_drift.py`, which also byte-compares `contracts` and `features` against dataset-ops's vendored copies.
`worker` is the deployable edge process and owns all live ML plus orchestration/state (camera workers, supervisor, scheduler, status/latest-frame/incident, edge-worker config). It composes `worker/sources`, `worker/runners`, `worker/perception`, `worker/domains`, and `events`; it is not a shared library, and there is no `runtime` package.

## Runtime Topology

Use explicit ML runtime names:

- `ml-api` is the FastAPI control/status/relay gateway. Its product routes live under `/api/v1`; health probes remain unversioned at `/health/live` and `/health/ready`. It may expose health, status, gateway model metadata, relay routes, and operator controls, but no prediction routes and no model loading.
- `ml-worker` is the long-running stream consumer. It receives camera or gateway-provided RTSP streams, runs model/domain evaluation, and relays facts to local `ml-api` at `/api/v1/relay/*` per ADR.
- Training is not a runtime service and no longer lives in this repo. eldercare-dataset-ops (ADR-0004) creates and evaluates artifacts; an operator copies the resulting artifact directory into `ml/models/fall/*` for worker/demo to load.

RTSP direction matters. The worker is not an RTSP server and must not embed a publisher. In development, camera-like RTSP input must come from a real camera/gateway or the external `SeniorAILab/rtsp-generator` CLI; this repo may only accept a configured worker-reachable RTSP URL. Do not add MediaMTX, FFmpeg, file-to-RTSP, or synthetic publisher scripts/commands here. Mock/stub/fake logic belongs in unit/contract test code and must not be presented as E2E evidence. Production worker code consumes configured streams and emits local relay events to `ml-api` under `/api/v1/relay/*`; it does not relay raw frames through FastAPI and does not call backend directly.

Do not add a second FastAPI app to `worker`. If a feature needs HTTP control, keep it in `ml-api` and pass state/config through explicit runtime contracts instead of importing api routes into the worker.

## Layout

```text
ml/
├── contracts/         # L0 contract types and artifact path helpers
├── features/          # L0 pure transforms
├── artifact_metadata/ # L0 model artifact metadata schema, read-side only (training moved to eldercare-dataset-ops, ADR-0004)
├── events/            # alert/event schema, publisher, outbox, ingest client
├── api/               # FastAPI gateway-only surface: lifespan, routes, relay, heartbeat-status; no ML
├── worker/            # edge worker process + live ML (`sources/`, `runners/`, `perception/`, `domains/`) and orchestration/state
├── demo/              # Streamlit demo harness
└── tests/             # pytest suite and dependency-ladder guard
```

`data`, `models`, caches, and generated outputs are storage/output roots, not agent-rule roots. Packages named `core` and `util` do not exist.

## Global Boundaries

- Keep `contracts` and `features` pure: no I/O, no model loading, no runtime boot.
- Keep worker-owned orchestration/state under `worker`; pass event sinks in by protocol so `api` and `worker` inject their own. No cross-boundary shared state between `ml-api` and `ml-worker` (connection is one-directional relay HTTP facts).
- Keep `api` independent of `worker`; api does not load trained artifacts or import runner adapters.
- Keep `demo` as a harness. It may render overlays, but production classification belongs in `worker`.
- Do not add AGENTS files outside the approved ML allowlist.

## Commands

```bash
uv run --directory ml pytest tests/test_import_dependency_ladder.py
```

## Verification Source

The import ladder is executable in `ml/tests/test_import_dependency_ladder.py`. Update that test before changing the ladder.
