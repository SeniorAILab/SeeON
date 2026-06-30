---
slug: ml-edge-a-worker-portable-runtime-layout
type: plan
status: active
date: 2026-06-23
author: codex
planner: omo-ulw-plan
source: .omo/plans/ml-edge-a-worker-portable-runtime-layout.md
---

# ml-edge-a-worker-portable-runtime-layout - Work Plan

## TL;DR (For humans)

**What you'll get:** The ML edge will be organized around a production worker that owns camera streams, inference, and signed event facts, while FastAPI stays a small health/status/debug API. The folder docs, AGENTS hierarchy, Docker files, and verification will all say the same thing.

**Why this approach:** A camera stream is stateful and long-running; HTTP API high availability does not automatically make RTSP ownership safe. Jetson Nano and future NVIDIA dGPU targets also need a portable worker boundary before committing to DeepStream or Triton.

**What it will NOT do:** It will not put RTSP loops or backend alert side effects into FastAPI. It will not add DeepStream, Triton, GStreamer, Redis, Celery, Kafka, or a new broker in this slice. It will not move model/data artifacts into git.

**Effort:** Large
**Risk:** Medium - the change crosses deployment, docs, tests, and ML runtime boundaries, but most production behavior already exists and the plan hardens it.
**Decisions to sanity-check:** A architecture is locked; two explicit ML Dockerfiles replace the current target-heavy Compose dependency; Jetson Nano is documented as a constrained legacy target, not a current DeepStream baseline.

Implementation entry: after this plan gate passes, execute it with `$omo:start-work` or an equivalent implementation lane. Full execution detail follows below.

---

> TL;DR (machine): Large/medium-risk hardening plan: preserve ADR-067 A architecture, split explicit edge Dockerfiles, add portable worker video seam, rebuild ML AGENTS/docs through depth 3, and verify dev/prod edge flow.

## Scope

### Must have

- Create the canonical repo execution-plan folder before product changes: `docs/exec-plan/active/ml-edge-a-worker-portable-runtime-layout/`.
- Preserve production live path: `RTSP -> ml-edge-worker -> backend /ingest/*`.
- Preserve FastAPI as API/control/debug surface only: health, status, models, debug prediction.
- Replace edge Compose's dependency on `ml/Dockerfile` targets with explicit `ml/Dockerfile.api` and `ml/Dockerfile.worker`.
- Add tests that fail before implementation and pass after implementation for:
  - edge Compose API/worker split,
  - host Compose having no ML services,
  - FastAPI having no production RTSP/frame/ingest route,
  - `serving/` not importing worker/event publishing code,
  - worker publishing only to backend ingest paths.
- Add a worker-side RTSP/video backend seam that keeps OpenCV as the only implemented backend now and documents GStreamer/DeepStream/Triton as future adapters.
- Rebuild ML guidance via `omo:init-deep` semantics through depth 3:
  - update `ml/AGENTS.md`,
  - create/update exact AGENTS allowlist:
    `ml/contracts/AGENTS.md`,
    `ml/features/AGENTS.md`,
    `ml/sources/AGENTS.md`,
    `ml/runners/AGENTS.md`,
    `ml/perception/AGENTS.md`,
    `ml/domains/AGENTS.md`,
    `ml/domains/fall/AGENTS.md`,
    `ml/domains/bed_exit/AGENTS.md`,
    `ml/runtime/AGENTS.md`,
    `ml/events/AGENTS.md`,
    `ml/serving/AGENTS.md`,
    `ml/serving/routes/AGENTS.md`,
    `ml/worker/AGENTS.md`,
    `ml/training/AGENTS.md`,
    `ml/training/models/AGENTS.md`,
    `ml/demo/AGENTS.md`,
    `ml/demo/pages/AGENTS.md`,
    `ml/tests/AGENTS.md`.
- Update `README.md`, `ml/README.md`, `docs/rules/ml-filesystem-layout.md`, `docs/api/ml-serving-api.md`, `docs/api/edge-ingest-api.md` if stale, `docs/runbooks/idis-camera-rtsp.md`, `docs/runbooks/live-fall-to-kakao-workflow.md`, and `docs/runbooks/thursday-mvp-demo.md`.
- Add `docs/decisions/README.md` and update `docs/decisions/README.md`.
- Verify deterministic tests, native dev commands, edge Compose config, Docker builds when Docker is available, FastAPI live endpoint, worker config validation, and edge Compose E2E with synthetic RTSP plus backend-shaped stub ingest.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No production RTSP loop, scheduler, frame relay, or backend alert publishing inside FastAPI.
- No worker-to-FastAPI raw frame relay in the production live path.
- No new Redis, Celery, Kafka, broker, or queue.
- No DeepStream, Triton, GStreamer, TensorRT, CUDA, or NVIDIA SDK dependency adoption in this slice.
- No Jetson Nano-specific production/DeepStream image and no RTX 5060-specific support claim. In this slice, Jetson Nano acceptance means documented constraints plus the same Python/OpenCV worker/API path and optional hardware smoke when an actual Nano is available.
- No backend route redesign and no movement of policy, idempotency, persistence, delivery, Kakao, or outbox ownership out of backend.
- No wholesale relocation of shared engine packages under `serving/`, `worker/`, `demo/`, or `training/`.
- No AGENTS files under caches, generated outputs, `ml/data/`, `ml/models/`, `__pycache__`, `.pytest_cache`, `.ruff_cache`, or `ml/experiments/runs/`.
- No public exposure hardening for `ml-edge-api` beyond documenting it as private/local edge API.
- No durable edge outbox/retry implementation.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: TDD for topology, serving boundary, worker ingest, and portable RTSP seam; tests-after for docs/AGENTS wording.
- Minimum deterministic test set:
  - `uv run --directory ml pytest tests/test_edge_topology_contract.py tests/test_serving_boundary_contract.py tests/test_worker_backend_ingest_contract.py tests/test_sources_rtsp.py tests/test_import_dependency_ladder.py`
  - `uv run --directory ml pytest tests/test_serving_health.py tests/test_serving_debug_predict.py tests/test_edge_worker_config.py tests/test_edge_runtime_e2e.py tests/test_events_ingest_client.py tests/test_edge_worker_cli.py tests/test_worker_entrypoint.py tests/test_edge_worker_four_streams.py tests/test_worker_runner_sharing.py`
  - `pnpm --filter backend test:e2e -- ingest-e2e.spec.ts` when `DATABASE_URL` and `DIRECT_URL` exist; otherwise record this as a gated gap and run `pnpm --filter backend test -- ingest.controller.spec.ts`.
  - `pnpm lint` and `pnpm typecheck`.
- Minimum deployment checks:
  - With temporary required prod env values: `docker compose --profile full -f compose.yaml -f compose.prod.yaml config --services`
  - `EDGE_CAMERA_CONFIG=/tmp/edge-cameras.json docker compose -f compose.edge.yaml config --services`
  - `docker build -f ml/Dockerfile.api -t eldercare-ml-edge-api:plan-smoke .`
  - `docker build -f ml/Dockerfile.worker -t eldercare-ml-edge-worker:plan-smoke .`
  - If Docker is unavailable, capture the exact error and still run Compose config plus pytest topology tests.
- Minimum Compose E2E checks:
  - Host local Compose: run with an isolated `COMPOSE_PROJECT_NAME=ulw-host-local-e2e`, temporary non-default ports (`BACKEND_PORT=18080`, `FRONT_PORT=13000`, `POSTGRES_PORT=15432`), `docker compose --profile full -f compose.yaml up -d --build db backend front`, then `curl -fsS http://127.0.0.1:18080/`, and cleanup with `docker compose --profile full -f compose.yaml down --remove-orphans` without `-v`.
  - Host prod-shaped Compose: run with an isolated `COMPOSE_PROJECT_NAME=ulw-host-prod-e2e`, temporary required prod env values, and a temporary override that maps backend/front to non-default host ports; start `docker compose -f compose.yaml -f compose.prod.yaml -f "$tmp_override" --profile full up -d --build db backend front`, assert `curl -fsS http://127.0.0.1:18082/`, and cleanup with `docker compose ... down --remove-orphans` without `-v`.
  - Edge Compose API health: run with an isolated `COMPOSE_PROJECT_NAME=ulw-edge-api-e2e`, `ML_SERVING_PORT=18000`, and a temporary `EDGE_CAMERA_CONFIG`, start `docker compose -f compose.edge.yaml up -d --build ml-edge-api`, then `curl -fsS http://127.0.0.1:18000/health/live`, and cleanup with `docker compose -f compose.edge.yaml down --remove-orphans` without `-v`.
  - Edge worker ingest smoke: run `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh`, which must use isolated container/project names, start synthetic RTSP streams plus a backend-shaped stub ingest server, run `ml-edge-worker` through Compose, assert received `/ingest/heartbeat` and `/ingest/alerts` requests, and always tear down containers/networks without deleting non-test volumes.
- Real-surface checks:
  - Start FastAPI in a tmux session and run `curl -i http://127.0.0.1:8000/health/live`; pass is HTTP `200` and a JSON body whose `status` field is `ok`.
  - Run worker config validation with `uv run --directory ml python -m worker.edge_worker --config config/edge-cameras.example.json --check-config`; pass is exit `0` and no secret leakage.
  - Run synthetic RTSP/worker/ingest smoke: `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh`; pass requires the worker container to read synthetic RTSP and the stub ingest server to record backend-shaped `/ingest/heartbeat` and `/ingest/alerts` calls.
- Evidence paths:
  - `.omo/evidence/task-<N>-ml-edge-a-worker-portable-runtime-layout.txt`
  - `.omo/evidence/final-ml-edge-a-worker-portable-runtime-layout.txt`

## Execution strategy

### Parallel execution waves

- Wave 0: create canonical exec plan and inspect dirty worktree.
- Wave 1: write failing-first topology/boundary/runtime tests.
- Wave 2: implement Docker split and worker RTSP backend seam.
- Wave 3: harden serving/worker contracts and backend ingest checks.
- Wave 4: update ADRs, README, runbooks, and ML AGENTS hierarchy.
- Wave 5: run deterministic and real-surface verification; fix regressions only within scope.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | all product changes | none |
| 2 | 1 | 5, 12 | 3, 4 |
| 3 | 1 | 6, 12 | 2, 4 |
| 4 | 1 | 7, 12 | 2, 3 |
| 5 | 2 | 9, 12 | 6, 8 |
| 6 | 3 | 9, 12 | 5, 7, 8 |
| 7 | 4 | 9, 12 | 6, 8 |
| 8 | 5 | 11, 12 | 6, 7, 9, 10 |
| 9 | 5, 6, 7 | 11, 12 | 10 |
| 10 | 1 | 11, 12 | 8, 9 |
| 11 | 8, 9, 10 | 12 | none |
| 12 | 2-11 | final handoff | none |

## Todos

> Implementation + Test = ONE todo. Never separate.

- [ ] 1. Create canonical repo execution plan and freeze scope
  What to do / Must NOT do: Create `docs/exec-plan/active/ml-edge-a-worker-portable-runtime-layout/plan.md` with frontmatter `slug: ml-edge-a-worker-portable-runtime-layout` and copy the full implementation plan body from this `.omo` plan: Scope, Must NOT guardrails, Verification strategy, Execution strategy, all 12 Todos with acceptance/QA/commit lines, Final verification wave, Commit strategy, and Success criteria. Keep a reference link back to `.omo/plans/ml-edge-a-worker-portable-runtime-layout.md`, but do not make the canonical plan a stub. Record dirty worktree exclusions. Do not edit product code before this file exists.
  Parallelization: Wave 0 | Blocked by: none | Blocks: all product changes
  References (executor has NO interview context - be exhaustive): `AGENTS.md` plan-first mandate; `.omo/plans/ml-edge-a-worker-portable-runtime-layout.md`; `docs/decisions/README.md`:24`; `docs/decisions/README.md`:18`
  Acceptance criteria: `test -f docs/exec-plan/active/ml-edge-a-worker-portable-runtime-layout/plan.md && rg -n "slug: ml-edge-a-worker-portable-runtime-layout|RTSP -> ml-edge-worker -> backend /ingest|FastAPI|\\[ \\] 12\\. Run full deterministic and real-surface verification|Commit strategy|Success criteria" docs/exec-plan/active/ml-edge-a-worker-portable-runtime-layout/plan.md`
  QA scenarios: happy: `omo sparkshell --shell 'python - <<'"'"'EOF'"'"'\nfrom pathlib import Path\np=Path("docs/exec-plan/active/ml-edge-a-worker-portable-runtime-layout/plan.md")\ns=p.read_text()\nrequired=["## Scope","## Verification strategy","## Execution strategy","## Todos","## Final verification wave","## Commit strategy","## Success criteria","- [ ] 1.","- [ ] 12."]\nmissing=[x for x in required if x not in s]\nraise SystemExit("missing canonical plan sections: "+", ".join(missing) if missing else 0)\nEOF'`, evidence `.omo/evidence/task-1-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'rg -n "FastAPI owns production RTSP|worker-to-FastAPI raw frame" docs/exec-plan/active/ml-edge-a-worker-portable-runtime-layout/plan.md && exit 1 || exit 0'`, evidence same path
  Commit: Y | docs(plan): add ml edge worker portable runtime plan

- [ ] 2. Add RED topology tests for host/edge Compose and explicit Dockerfiles
  What to do / Must NOT do: Add `ml/tests/test_edge_topology_contract.py` before changing Compose. It must assert host prod services exclude ML, edge services are exactly `ml-edge-api` and `ml-edge-worker`, and edge builds use `ml/Dockerfile.api` plus `ml/Dockerfile.worker` rather than `ml/Dockerfile` targets. Do not relax assertions to match the old one-Dockerfile state.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5, 12
  References: `compose.edge.yaml:11`; `compose.edge.yaml:38`; `compose.yaml`; `compose.prod.yaml`; `ml/Dockerfile:34`; `ml/Dockerfile:52`; `docs/decisions/README.md`:18`
  Acceptance criteria: Initial RED proof captured with `uv run --directory ml pytest tests/test_edge_topology_contract.py` failing because edge Compose still references `ml/Dockerfile`; final GREEN proof uses the same command and passes.
  QA scenarios: happy: `omo sparkshell --shell 'uv run --directory ml pytest tests/test_edge_topology_contract.py'`, evidence `.omo/evidence/task-2-ml-edge-a-worker-portable-runtime-layout.txt`; failure: before implementation, same command must fail with an assertion mentioning `ml/Dockerfile.api` or `ml/Dockerfile.worker`, evidence same path
  Commit: Y | test(ml): lock edge compose api worker topology

- [ ] 3. Add RED FastAPI boundary tests for routes, payloads, and forbidden imports
  What to do / Must NOT do: Add `ml/tests/test_serving_boundary_contract.py`. It must introspect `serving.main.create_app(lifespan=no_lifespan).routes`, allow only health/status/models/debug prediction routes plus docs/OpenAPI routes if present, assert no route containing `rtsp`, `frames`, `cameras/stream`, or `ingest`, assert `/debug/predict/window` rejects raw `frame` payload fields, and statically assert `ml/serving/` does not import `worker`, `events.edge_ingest_client`, or `runtime.edge_worker*`. Remove or relocate the current compatibility shim `ml/serving/edge_worker.py` during implementation so the test can pass. Do not add exceptions for production RTSP.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6, 12
  References: `ml/serving/main.py:20`; `ml/serving/routes/debug.py`; `ml/serving/edge_worker.py:1`; `docs/api/ml-serving-api.md:3`; `docs/decisions/README.md`:41`
  Acceptance criteria: Initial RED proof captured because `ml/serving/edge_worker.py` imports worker or because raw route forbiddance is not yet locked; final GREEN proof uses `uv run --directory ml pytest tests/test_serving_boundary_contract.py`.
  QA scenarios: happy: `omo sparkshell --shell 'uv run --directory ml pytest tests/test_serving_boundary_contract.py'`, evidence `.omo/evidence/task-3-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'rg -n "from worker|events.edge_ingest_client|/ingest|/rtsp|/frames" ml/serving && exit 1 || exit 0'`, evidence same path
  Commit: Y | test(ml): forbid production rtsp ownership in serving

- [ ] 4. Add worker-to-backend ingest contract tests
  What to do / Must NOT do: Add `ml/tests/test_worker_backend_ingest_contract.py`. It must prove worker config uses backend `/ingest/alerts` and `/ingest/heartbeat`, per-camera credentials remain in `EDGE_CAMERA_CONFIG`, and worker publishing never targets FastAPI debug routes. Do not move backend policy into worker; assert emitted payloads are facts only.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 7, 12
  References: `ml/runtime/edge_worker_config.py`; `ml/worker/edge_worker.py:166`; `ml/events/edge_ingest_client.py:20`; `docs/api/edge-ingest-api.md:3`; `docs/api/ml-serving-api.md:5`; `ml/tests/test_events_ingest_client.py:46`
  Acceptance criteria: `uv run --directory ml pytest tests/test_worker_backend_ingest_contract.py tests/test_events_ingest_client.py` passes and no assertion mentions FastAPI as production ingest target.
  QA scenarios: happy: `omo sparkshell --shell 'uv run --directory ml pytest tests/test_worker_backend_ingest_contract.py tests/test_events_ingest_client.py'`, evidence `.omo/evidence/task-4-ml-edge-a-worker-portable-runtime-layout.txt`; failure: inject or assert a config using `http://ml-edge-api:8000/debug/predict/window` as alert URL is rejected or fails contract, evidence same path
  Commit: Y | test(ml): lock worker backend ingest contract

- [ ] 5. Split edge Dockerfiles and update edge Compose
  What to do / Must NOT do: Create `ml/Dockerfile.api` for FastAPI and `ml/Dockerfile.worker` for worker. Update `compose.edge.yaml` so `ml-edge-api.build.dockerfile` is `ml/Dockerfile.api` and `ml-edge-worker.build.dockerfile` is `ml/Dockerfile.worker`. Delete `target:` entries from edge Compose. Remove `ml/Dockerfile` after confirming no repo references remain, or leave it only if every remaining reference is documented as compatibility and not used by Compose. Do not add NVIDIA SDKs, DeepStream, Triton, or GStreamer dependencies.
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 9, 12
  References: `ml/Dockerfile`; `compose.edge.yaml:11`; `compose.edge.yaml:38`; `ml/pyproject.toml:8`; `ml/pyproject.toml:35`; `docs/decisions/README.md`:22`
  Acceptance criteria: `uv run --directory ml pytest tests/test_edge_topology_contract.py` passes; `EDGE_CAMERA_CONFIG=/tmp/edge-cameras.json docker compose -f compose.edge.yaml config` shows two explicit dockerfile paths and no build targets; `rg -n "dockerfile: ml/Dockerfile|target: runner|target: worker-runner" compose.edge.yaml docs ml package.json` returns no active production reference.
  QA scenarios: happy: `omo sparkshell --shell 'EDGE_CAMERA_CONFIG=/tmp/edge-cameras.json docker compose -f compose.edge.yaml config --services && EDGE_CAMERA_CONFIG=/tmp/edge-cameras.json docker compose -f compose.edge.yaml config | rg -n "dockerfile: ml/Dockerfile.api|dockerfile: ml/Dockerfile.worker"'`, evidence `.omo/evidence/task-5-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'EDGE_CAMERA_CONFIG=/tmp/edge-cameras.json docker compose -f compose.edge.yaml config | rg -n "target:|dockerfile: ml/Dockerfile$" && exit 1 || exit 0'`, evidence same path
  Commit: Y | build(ml): split edge api and worker Dockerfiles

- [ ] 6. Add portable RTSP/video backend seam without new dependencies
  What to do / Must NOT do: Introduce a minimal seam around `RTSPSource` so OpenCV is one backend implementation and future GStreamer/DeepStream/Triton integration can plug in without changing worker/domain/backend contracts. Concrete path: add `ml/sources/rtsp_backend.py` with a `RTSPBackend` protocol and `OpenCVRTSPBackend`; update `ml/sources/rtsp.py` so `RTSPSource` delegates open/read/release through an internal backend factory. Preserve the current public constructor shape (`url`, `max_failures`, `open_timeout_ms`, `read_timeout_ms`) or replace timeout knobs with a typed options/config object only if backward compatibility is maintained; do not add a fifth loose constructor parameter. Tests may inject a fake backend by monkeypatching the factory or using a typed options object. Do not import `runtime`, `events`, `serving`, NVIDIA SDKs, or shell out to `gst-launch`.
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: 9, 12
  References: `ml/sources/rtsp.py:16`; `docs/rules/ml-filesystem-layout.md:17`; `ml/tests/test_sources_rtsp.py`; official GStreamer docs state apps should use API/gst_parse_launch rather than product code around shell pipelines
  Acceptance criteria: Add failing-first coverage to `ml/tests/test_sources_rtsp.py` for an injected fake backend and timeout/buffer behavior; final `uv run --directory ml pytest tests/test_sources_rtsp.py tests/test_sources_no_demo_dependency.py tests/test_import_dependency_ladder.py` passes.
  QA scenarios: happy: `omo sparkshell --shell 'uv run --directory ml pytest tests/test_sources_rtsp.py tests/test_sources_no_demo_dependency.py tests/test_import_dependency_ladder.py'`, evidence `.omo/evidence/task-6-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'rg -n "gst-launch|deepstream|triton|tensorrt|cuda" ml/sources ml/runtime ml/worker && exit 1 || exit 0'`, evidence same path
  Commit: Y | refactor(ml): add portable rtsp backend seam

- [ ] 7. Harden worker runtime ownership and concurrency invariants
  What to do / Must NOT do: Extend tests so ADR-067 invariants stay true: one capture thread per camera, latest-frame buffer, scheduler/inference loop outside capture threads, shared model runners created once for four cameras, and per-camera secret redaction. Do not move `EdgeIngestClient` into `runtime/`; `runtime` must still not import `events`.
  Parallelization: Wave 3 | Blocked by: 4 | Blocks: 9, 12
  References: `docs/decisions/README.md`:31`; `ml/runtime/edge_worker_supervisor.py:52`; `ml/runtime/camera_worker.py:43`; `ml/worker/edge_worker.py:124`; `ml/tests/test_worker_runner_sharing.py:26`; `ml/tests/test_edge_worker_four_streams.py:24`; `ml/tests/test_import_dependency_ladder.py:121`
  Acceptance criteria: `uv run --directory ml pytest tests/test_edge_worker_supervisor.py tests/test_edge_worker_four_streams.py tests/test_worker_runner_sharing.py tests/test_edge_worker_config.py tests/test_import_dependency_ladder.py` passes and contains assertions for same runner object identity across four workers.
  QA scenarios: happy: `omo sparkshell --shell 'uv run --directory ml pytest tests/test_edge_worker_supervisor.py tests/test_edge_worker_four_streams.py tests/test_worker_runner_sharing.py tests/test_edge_worker_config.py tests/test_import_dependency_ladder.py'`, evidence `.omo/evidence/task-7-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'python - <<EOF\nfrom pathlib import Path\np=Path(\"ml/runtime\")\nraise SystemExit(1 if any(\"events\" in f.read_text() for f in p.rglob(\"*.py\")) else 0)\nEOF'`, evidence same path
  Commit: Y | test(ml): preserve edge worker concurrency invariants

- [ ] 8. Add deterministic edge Compose RTSP-to-stub-ingest E2E
  What to do / Must NOT do: Add or upgrade `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh` so it starts synthetic RTSP inputs, a backend-shaped stub ingest server exposing `/ingest/heartbeat` and `/ingest/alerts`, and the `ml-edge-worker` container through `compose.edge.yaml`. The script must assert that the worker reads the RTSP fixture and the stub records at least one heartbeat and one alert/fact request. It must always clean up containers, temporary config, secrets, and networks. Do not require real camera credentials, a real backend database, or FastAPI as a production ingest target.
  Parallelization: Wave 3 | Blocked by: 5 | Blocks: 11, 12
  References: `scripts/ml-edge-four-mock-rtsp-e2e.sh`; `compose.edge.yaml`; `ml/config/edge-cameras.example.json`; `ml/worker/edge_worker.py`; `ml/events/edge_ingest_client.py`; `docs/api/edge-ingest-api.md:3`
  Acceptance criteria: `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh` exits `0`, writes an evidence log showing stub `/ingest/heartbeat` and `/ingest/alerts` calls, and `docker ps -a --format '{{.Names}}' | rg 'ml-edge-four-mock|edge-ingest-stub'` returns no leftovers after cleanup.
  QA scenarios: happy: `omo sparkshell --shell 'scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh'`, evidence `.omo/evidence/task-8-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'docker ps -a --format "{{.Names}}" | rg "ml-edge-four-mock|edge-ingest-stub" && exit 1 || exit 0'`, evidence same path
  Commit: Y | test(ml): add edge compose rtsp ingest smoke

- [ ] 9. Write ADR-068 and update architecture/API docs
  What to do / Must NOT do: Add `docs/decisions/README.md`. It must state: A architecture remains current, worker owns RTSP/inference/domain fact publishing, FastAPI is lightweight, OpenCV remains current backend, GStreamer/DeepStream/Triton are future adapters, Jetson Nano is legacy-locked, future dGPU support must be release-matrix pinned, and `ml-edge-api` is private/local edge surface unless later secured. Update `docs/decisions/README.md`, `docs/api/ml-serving-api.md`, `docs/api/edge-ingest-api.md`, and `docs/rules/ml-filesystem-layout.md` for wording consistency. Do not supersede ADR-067; ADR-068 complements it.
  Parallelization: Wave 4 | Blocked by: 5, 6, 7 | Blocks: 11, 12
  References: `docs/decisions/README.md`; `docs/decisions/README.md`; `docs/api/ml-serving-api.md:3`; `docs/api/edge-ingest-api.md:3`; `docs/rules/ml-filesystem-layout.md:11`; official NVIDIA/GStreamer/Triton evidence from best-practice research
  Acceptance criteria: `rg -n "ADR-068|portable video runtime|Jetson Nano|DeepStream|GStreamer|Triton|RTSP -> ml-edge-worker -> backend" docs/decisions docs/api docs/rules` finds the expected docs; `rg -n "FastAPI.*production RTSP|worker-to-FastAPI raw frame" docs` returns no contradictory wording.
  QA scenarios: happy: `omo sparkshell --shell 'rg -n "ADR-068|portable video runtime|Jetson Nano|DeepStream|GStreamer|Triton" docs/decisions docs/api docs/rules'`, evidence `.omo/evidence/task-9-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'rg -n "FastAPI owns production RTSP|worker-to-FastAPI raw frame|ml-edge-api.*backend ingest" docs && exit 1 || exit 0'`, evidence same path
  Commit: Y | docs(ml): record portable edge worker runtime decision

- [ ] 10. Rebuild ML AGENTS hierarchy through depth 3
  What to do / Must NOT do: Apply `omo:init-deep` semantics manually or via a helper pass: survey `ml/` through depth 3, update `ml/AGENTS.md`, and create/update only the allowlisted AGENTS files in Scope. Remove stale `core/ util/` references. Child AGENTS must not repeat parent content; they must state local ownership, allowed imports, forbidden imports, command/test hints, and gotchas only where useful. Do not pad files to a line count and do not create AGENTS under skipped paths.
  Parallelization: Wave 4 | Blocked by: 1 | Blocks: 11, 12
  References: `ml/AGENTS.md:1`; `docs/rules/ml-filesystem-layout.md:11`; `ml/tests/test_import_dependency_ladder.py`; `ml/domains/__init__.py`; `ml/tests/test_domain_registry_scaffolds_disabled.py`; `omo:init-deep` skill instructions
  Acceptance criteria: A generated expected-list file exactly matches `find ml -path "*/AGENTS.md" | sort`; `rg -n "core/ util/|core/|util/" ml/**/AGENTS.md` has no stale layout references except explicit "do not create core/util"; `uv run --directory ml pytest tests/test_import_dependency_ladder.py` passes.
  QA scenarios: happy: `omo sparkshell --shell 'python - <<'"'"'EOF'"'"'\nfrom pathlib import Path\nexpected = \"\"\"\nml/AGENTS.md\nml/contracts/AGENTS.md\nml/demo/AGENTS.md\nml/demo/pages/AGENTS.md\nml/domains/AGENTS.md\nml/domains/bed_exit/AGENTS.md\nml/domains/fall/AGENTS.md\nml/events/AGENTS.md\nml/features/AGENTS.md\nml/perception/AGENTS.md\nml/runners/AGENTS.md\nml/runtime/AGENTS.md\nml/serving/AGENTS.md\nml/serving/routes/AGENTS.md\nml/sources/AGENTS.md\nml/tests/AGENTS.md\nml/training/AGENTS.md\nml/training/models/AGENTS.md\nml/worker/AGENTS.md\n\"\"\".strip().splitlines()\nactual = sorted(str(p) for p in Path("ml").rglob("AGENTS.md"))\nraise SystemExit("AGENTS mismatch\\nexpected="+repr(expected)+"\\nactual="+repr(actual) if actual != expected else 0)\nEOF\nuv run --directory ml pytest tests/test_import_dependency_ladder.py'`, evidence `.omo/evidence/task-10-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'find ml \\( -path "*/__pycache__/*" -o -path "ml/data/*" -o -path "ml/models/*" -o -path "ml/.pytest_cache/*" -o -path "ml/.ruff_cache/*" \\) -name AGENTS.md -print | rg . && exit 1 || exit 0'`, evidence same path
  Commit: Y | docs(ml): rebuild agent guidance hierarchy

- [ ] 11. Update README and runbooks for dev/prod edge flow
  What to do / Must NOT do: Update root `README.md`, `ml/README.md`, `docs/runbooks/idis-camera-rtsp.md`, `docs/runbooks/live-fall-to-kakao-workflow.md`, and `docs/runbooks/thursday-mvp-demo.md`. They must distinguish native dev (`pnpm dev:ml`, `pnpm dev:ml-worker`) from edge Compose (`docker compose -f compose.edge.yaml up -d --build`), say production RTSP belongs to worker, say FastAPI is private/local debug/control API, show `EDGE_CAMERA_CONFIG` with per-camera secrets, and split deterministic synthetic smoke from optional real Jetson/camera smoke. Do not tell operators to send raw RTSP frames to FastAPI.
  Parallelization: Wave 4 | Blocked by: 8, 9, 10 | Blocks: 12
  References: `README.md`; `ml/README.md:3`; `ml/README.md:55`; `package.json:11`; `package.json:12`; `compose.edge.yaml:1`; `ml/config/edge-cameras.example.json`; `docs/runbooks/idis-camera-rtsp.md`; `docs/runbooks/live-fall-to-kakao-workflow.md`; `docs/runbooks/thursday-mvp-demo.md`
  Acceptance criteria: Required contract sentences exist in each relevant doc family: native dev has both `pnpm dev:ml` and `pnpm dev:ml-worker`, edge Compose uses `compose.edge.yaml`, production RTSP belongs to `ml-edge-worker`, `ml-edge-api` is private/local debug/control, `EDGE_CAMERA_CONFIG` owns camera secrets, and Jetson Nano is hardware-gated. Contradictory terms are absent.
  QA scenarios: happy: `omo sparkshell --shell 'python - <<'"'"'EOF'"'"'\nfrom pathlib import Path\nchecks = {\n  "README.md": ["pnpm dev:ml", "pnpm dev:ml-worker", "compose.edge.yaml"],\n  "ml/README.md": ["ml-edge-worker", "ml-edge-api", "EDGE_CAMERA_CONFIG"],\n  "docs/runbooks/idis-camera-rtsp.md": ["ml-edge-worker", "EDGE_CAMERA_CONFIG"],\n  "docs/runbooks/live-fall-to-kakao-workflow.md": ["backend /ingest", "ml-edge-worker"],\n  "docs/runbooks/thursday-mvp-demo.md": ["synthetic", "Jetson Nano"],\n}\nmissing=[]\nfor path, terms in checks.items():\n    text=Path(path).read_text()\n    missing += [f"{path}:{term}" for term in terms if term not in text]\nraise SystemExit("missing required doc contract terms: "+", ".join(missing) if missing else 0)\nEOF'`, evidence `.omo/evidence/task-11-ml-edge-a-worker-portable-runtime-layout.txt`; failure: `omo sparkshell --shell 'rg -n "FastAPI.*RTSP|send.*RTSP.*FastAPI|worker.*raw frame.*FastAPI|ml-edge-api.*production ingest" README.md ml/README.md docs/runbooks && exit 1 || exit 0'`, evidence same path
  Commit: Y | docs(runbooks): clarify edge worker dev and compose flow

- [ ] 12. Run full deterministic and real-surface verification
  What to do / Must NOT do: Run every verification command in this plan through one evidence-capturing shell script/block with `trap` cleanup, capture output under `.omo/evidence/final-ml-edge-a-worker-portable-runtime-layout.txt`, and fix only scoped regressions. Start FastAPI in tmux, hit `/health/live` with curl, stop the tmux session on both success and failure, and record cleanup. Run worker `--check-config`. Run host local Compose E2E, host prod-shaped Compose E2E, edge API Compose health E2E, Docker build checks if Docker is available, and the synthetic RTSP-to-stub-ingest Compose E2E script. Do not run volume-deleting Compose cleanup; use isolated `COMPOSE_PROJECT_NAME`s and non-default ports. Do not claim real four-camera hardware or Jetson Nano hardware success unless real device credentials were actually used.
  Parallelization: Wave 5 | Blocked by: 2-11 | Blocks: final handoff
  References: all above; `docs/decisions/README.md`:61`; `ml/config/edge-cameras.example.json`
  Acceptance criteria: All deterministic tests pass or a pre-existing/gated failure is explicitly named; FastAPI tmux curl returns 200 and is recorded in final evidence; worker check-config exits 0; host local Compose E2E, host prod-shaped Compose E2E, and edge API Compose health E2E all run with isolated project names and non-default ports; Docker images build when Docker is available; `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh` exits 0; tmux and Docker resources are cleaned up without deleting Compose volumes.
  QA scenarios: happy: `omo sparkshell --shell 'bash <<'"'"'EOF'"'"'\nset -euo pipefail\nmkdir -p .omo/evidence\nexec > >(tee .omo/evidence/final-ml-edge-a-worker-portable-runtime-layout.txt) 2>&1\nSESSION=ulw-qa-ml-api\nHOST_LOCAL_PROJECT=ulw-host-local-e2e\nHOST_PROD_PROJECT=ulw-host-prod-e2e\nEDGE_API_PROJECT=ulw-edge-api-e2e\nTMP_EDGE_CONFIG=$(mktemp)\nTMP_PROD_OVERRIDE=$(mktemp --suffix=.yaml)\ncleanup() {\n  tmux has-session -t \"$SESSION\" 2>/dev/null && tmux kill-session -t \"$SESSION\" || true\n  COMPOSE_PROJECT_NAME=\"$HOST_LOCAL_PROJECT\" BACKEND_PORT=18080 FRONT_PORT=13000 POSTGRES_PORT=15432 docker compose --profile full -f compose.yaml down --remove-orphans || true\n  COMPOSE_PROJECT_NAME=\"$HOST_PROD_PROJECT\" POSTGRES_USER=fall POSTGRES_PASSWORD=fall POSTGRES_DB=fall_dev APP_DB_USER=fall_app APP_DB_PASSWORD=fall_app DATABASE_URL=postgresql://fall_app:fall_app@db:5432/fall_dev?schema=public DIRECT_URL=postgresql://fall:fall@db:5432/fall_dev?schema=public FRONT_ORIGIN=http://localhost:13002 ALERT_DASHBOARD_URL=http://localhost:13002 KAKAO_REST_API_KEY=dev-placeholder-kakao-rest-api-key KAKAO_REDIRECT_URI=http://localhost:18082/auth/kakao/callback SESSION_JWT_SECRET=dev-only-session-secret-change-me-32chars-min KAKAO_TOKEN_ENC_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef docker compose --profile full -f compose.yaml -f compose.prod.yaml -f \"$TMP_PROD_OVERRIDE\" down --remove-orphans || true\n  COMPOSE_PROJECT_NAME=\"$EDGE_API_PROJECT\" ML_SERVING_PORT=18000 EDGE_CAMERA_CONFIG=\"$TMP_EDGE_CONFIG\" docker compose -f compose.edge.yaml down --remove-orphans || true\n  rm -f \"$TMP_EDGE_CONFIG\" \"$TMP_PROD_OVERRIDE\"\n}\ntrap cleanup EXIT\nprintf '{\"cameras\": []}\\n' > \"$TMP_EDGE_CONFIG\"\ncat > \"$TMP_PROD_OVERRIDE\" <<'"'"'YAML'"'"'\nservices:\n  backend:\n    ports:\n      - \"18082:8080\"\n  front:\n    ports: !override\n      - \"13002:3000\"\nYAML\nuv run --directory ml pytest tests/test_edge_topology_contract.py tests/test_serving_boundary_contract.py tests/test_worker_backend_ingest_contract.py tests/test_sources_rtsp.py tests/test_import_dependency_ladder.py\nuv run --directory ml pytest\nif [ -n \"${DATABASE_URL:-}\" ] && [ -n \"${DIRECT_URL:-}\" ]; then pnpm --filter backend test:e2e -- ingest-e2e.spec.ts; else pnpm --filter backend test -- ingest.controller.spec.ts; fi\npnpm lint\npnpm typecheck\nEDGE_CAMERA_CONFIG=\"$TMP_EDGE_CONFIG\" docker compose -f compose.edge.yaml config --services\nPOSTGRES_USER=fall POSTGRES_PASSWORD=fall POSTGRES_DB=fall_dev APP_DB_USER=fall_app APP_DB_PASSWORD=fall_app DATABASE_URL=postgresql://fall_app:fall_app@db:5432/fall_dev?schema=public DIRECT_URL=postgresql://fall:fall@db:5432/fall_dev?schema=public FRONT_ORIGIN=http://localhost:13002 ALERT_DASHBOARD_URL=http://localhost:13002 KAKAO_REST_API_KEY=dev-placeholder-kakao-rest-api-key KAKAO_REDIRECT_URI=http://localhost:18082/auth/kakao/callback SESSION_JWT_SECRET=dev-only-session-secret-change-me-32chars-min KAKAO_TOKEN_ENC_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef docker compose --profile full -f compose.yaml -f compose.prod.yaml -f \"$TMP_PROD_OVERRIDE\" config --services\nuv run --directory ml python -m worker.edge_worker --config config/edge-cameras.example.json --check-config\ntmux new-session -d -s \"$SESSION\" \"cd /Users/<user>/.codex/worktrees/5f20/eldercare-fall-ai && pnpm dev:ml\"\nsleep 5\ncurl -i http://127.0.0.1:8000/health/live\ntmux kill-session -t \"$SESSION\"\nCOMPOSE_PROJECT_NAME=\"$HOST_LOCAL_PROJECT\" BACKEND_PORT=18080 FRONT_PORT=13000 POSTGRES_PORT=15432 docker compose --profile full -f compose.yaml up -d --build db backend front\ncurl -fsS http://127.0.0.1:18080/\nCOMPOSE_PROJECT_NAME=\"$HOST_PROD_PROJECT\" POSTGRES_USER=fall POSTGRES_PASSWORD=fall POSTGRES_DB=fall_dev APP_DB_USER=fall_app APP_DB_PASSWORD=fall_app DATABASE_URL=postgresql://fall_app:fall_app@db:5432/fall_dev?schema=public DIRECT_URL=postgresql://fall:fall@db:5432/fall_dev?schema=public FRONT_ORIGIN=http://localhost:13002 ALERT_DASHBOARD_URL=http://localhost:13002 KAKAO_REST_API_KEY=dev-placeholder-kakao-rest-api-key KAKAO_REDIRECT_URI=http://localhost:18082/auth/kakao/callback SESSION_JWT_SECRET=dev-only-session-secret-change-me-32chars-min KAKAO_TOKEN_ENC_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef docker compose --profile full -f compose.yaml -f compose.prod.yaml -f \"$TMP_PROD_OVERRIDE\" up -d --build db backend front\ncurl -fsS http://127.0.0.1:18082/\nCOMPOSE_PROJECT_NAME=\"$EDGE_API_PROJECT\" ML_SERVING_PORT=18000 EDGE_CAMERA_CONFIG=\"$TMP_EDGE_CONFIG\" docker compose -f compose.edge.yaml up -d --build ml-edge-api\ncurl -fsS http://127.0.0.1:18000/health/live\nscripts/ml-edge-four-mock-rtsp-ingest-e2e.sh\nif docker info >/dev/null 2>&1; then docker build -f ml/Dockerfile.api -t eldercare-ml-edge-api:plan-smoke . && docker build -f ml/Dockerfile.worker -t eldercare-ml-edge-worker:plan-smoke .; else echo \"Docker daemon unavailable: build skipped after config/e2e gates\"; fi\nEOF'`, evidence `.omo/evidence/task-12-ml-edge-a-worker-portable-runtime-layout.txt` and `.omo/evidence/final-ml-edge-a-worker-portable-runtime-layout.txt`; failure: same command exits nonzero after running the `trap` cleanup; inspect `.omo/evidence/final-ml-edge-a-worker-portable-runtime-layout.txt` for the failing gate and cleanup receipt
  Commit: N | final verification only

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE based on evidence. Ask the user only for destructive, credential-gated, external-production, or materially scope-changing actions.

- [ ] F1. Plan compliance audit: independent reviewer checks implementation changed only files allowed by this plan, all Must NOT rules hold, the canonical exec plan exists, and no false-confidence gates replace real tests.
- [ ] F2. Code quality review: independent reviewer explicitly covers `omo:programming` and `omo:remove-ai-slops` criteria: dependency creep, parameter bloat, boundary purity, unnecessary extraction/normalization, tautological or implementation-mirroring tests, excessive/useless tests, and overfit documentation checks.
- [ ] F3. Real-surface QA: run FastAPI curl, worker `--check-config`, host local Compose E2E, host prod-shaped Compose E2E, edge API Compose health E2E, Docker builds when available, and synthetic RTSP-to-stub-ingest Compose smoke; store transcripts.
- [ ] F4. Scope fidelity: independent reviewer verifies A architecture remained `worker -> backend ingest`, not `worker -> FastAPI -> backend`, and that no backend policy/idempotency redesign was included.

## Commit strategy

- Use small conventional commits in the todo order.
- Do not auto-commit unless the user explicitly asks; stage or present draft commit messages if working interactively.
- Suggested commits:
  1. `docs(plan): add ml edge worker portable runtime plan`
  2. `test(ml): lock edge compose api worker topology`
  3. `test(ml): forbid production rtsp ownership in serving`
  4. `test(ml): lock worker backend ingest contract`
  5. `build(ml): split edge api and worker Dockerfiles`
  6. `refactor(ml): add portable rtsp backend seam`
  7. `test(ml): preserve edge worker concurrency invariants`
  8. `test(ml): add edge compose rtsp ingest smoke`
  9. `docs(ml): record portable edge worker runtime decision`
  10. `docs(ml): rebuild agent guidance hierarchy`
  11. `docs(runbooks): clarify edge worker dev and compose flow`
- Add footer to each implementation commit body: `Plan: .omo/plans/ml-edge-a-worker-portable-runtime-layout.md`.

## Success criteria

- The repo has a canonical active execution plan for this work before code/docs changes.
- `ml-edge-worker` remains the only production RTSP/inference/domain fact publisher.
- `ml-edge-api` remains a lightweight FastAPI API/control/debug service with no production RTSP/frame/ingest ownership.
- Edge Compose uses two explicit Dockerfiles and exposes two edge services; host Compose remains ML-free.
- Worker RTSP intake has a backend seam that keeps OpenCV current and leaves GStreamer/DeepStream/Triton as documented future adapters.
- Jetson Nano and future dGPU constraints are documented without overclaiming current support.
- ML AGENTS are rebuilt through depth 3 using the exact allowlist and no generated/data/model directories.
- README, ML README, API docs, ADRs, and runbooks agree on the same architecture.
- Deterministic tests, lint/typecheck, Compose config checks, Docker builds when available, synthetic RTSP-to-stub-ingest Compose E2E, FastAPI curl, and worker config validation are captured in `.omo/evidence/`.
