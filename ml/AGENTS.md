# ML Agent Rules

Python/uv edge runtime for fall and bed-exit detection. Root run/boot flow stays in the repository `AGENTS.md`; this file owns only the `ml/` package map and import ladder.

## Package Ladder

Lower layers may import only same-layer or lower-layer packages, except `domains` and `runtime` must not import each other.

| Layer | Packages | Ownership |
| --- | --- | --- |
| L0 | `contracts`, `features` | Dataclasses, protocols, constants, and pure feature math |
| L1 | `sources`, `runners` | Frame intake, camera probing, model runners, registry, device/warmup |
| L2 | `perception` | Observation construction, tracking, scene state, bed detection, frame windows |
| L3 | `domains`, `runtime` | Domain event interpretation and edge runtime orchestration |
| L4 | `events` | Alert/event schemas, signing, publishers, outbox, backend ingest client |
| L5 | `serving`, `demo` | FastAPI serving and Streamlit developer demo |

`training` is a batch lifecycle package: it may import only `training`, `contracts`, `features`, `sources`, and `runners`.
`worker` is the deployable edge process: it composes `sources`, `runners`, `runtime`, `domains`, and `events` but should not become a shared library.

## Layout

```text
ml/
├── contracts/        # L0 contract types and artifact path helpers
├── features/         # L0 pure transforms
├── sources/          # L1 FrameSource implementations and source registry
├── runners/          # L1 model runners and ModelRegistry
├── perception/       # L2 observation builders and tracking state
├── domains/          # L3 domain detectors and DomainRegistry
├── runtime/          # L3 camera workers, scheduler, status, edge runtime
├── events/           # L4 alert schema, signing, publisher, outbox, ingest client
├── serving/          # L5 FastAPI app, lifespan, routes, prediction pipeline
├── worker/           # edge worker CLI/process entrypoint
├── training/         # batch training/evaluation lifecycle
├── demo/             # Streamlit demo harness
└── tests/            # pytest suite and dependency-ladder guard
```

`data`, `models`, caches, and generated outputs are storage/output roots, not agent-rule roots. Packages named `core` and `util` do not exist.

## Global Boundaries

- Keep `contracts` and `features` pure: no I/O, no model loading, no runtime boot.
- Keep `runtime` independent of `events`; pass event sinks in from `serving` or `worker`.
- Keep `serving` independent of `training`; serving loads trained artifacts through `runners.sklearn_fall` and serving adapters.
- Keep `demo` as a harness. It may render overlays and call serving, but production classification belongs in `serving`.
- Do not add AGENTS files outside the approved ML allowlist.

## Commands

```bash
uv run --directory ml pytest tests/test_import_dependency_ladder.py
```

## Verification Source

The import ladder is executable in `ml/tests/test_import_dependency_ladder.py`. Update that test before changing the ladder.
