---
slug: ml-worker-lstm-yaml-contract
status: done
---

# ml-worker-lstm-yaml-contract - Work Plan

## TL;DR (For humans)
**What you'll get:** `ml-worker` becomes the explicit RTSP stream consumer and fall-inference runtime. It reads a YAML contract, loads an LSTM fall model, consumes camera/dev-harness RTSP input, and emits a real fall event through the existing domain and ingest path.

**Why this approach:** `ml-api`, `ml-worker`, and `training` are different lifecycles. FastAPI stays as control/debug/status only, the worker runs the long-lived stream loop, and training only produces artifacts that runtime loads through `runners`. This includes the narrow `serving/ -> api/` rename now, while deferring the broader worker/runtime tree move until after the fall path is proven.

**What it will NOT do:** It will not put an RTSP publisher/server inside the worker. It will not move raw frames or live inference into FastAPI. It will not move all shared runtime packages under `worker/` in this pass.

**Effort:** Medium
**Risk:** High - runtime config, model loading, worker state boundaries, Docker/runbook surfaces, and real-surface smoke all change together.
**Decisions to sanity-check:** YAML-only config; `serving/ -> api/` now; broad worker tree restructuring deferred; `ml-api`/`ml-worker` naming; LSTM runtime artifact contract; per-camera temporal/domain state.

Your next move: start execution with `$omo:start-work` or ask for high-accuracy Momus review first. Full execution detail follows below.

---

> TL;DR (machine): Medium/High: rename `serving/` to `api/`, normalize `ml-api`/`ml-worker`, replace JSON worker config with YAML, wire YAML-selected LSTM runtime fall runner, isolate per-camera state, and prove RTSP-consumer worker execution emits backend-shaped heartbeat plus fall alert; defer broad runtime tree relocation.

## Scope
### Must have
- Runtime naming:
  - Root scripts: `dev:ml-api` and `dev:ml-worker`.
  - Remove ambiguous `dev:ml`; no fallback alias.
  - Compose services: `ml-api` and `ml-worker`.
  - Do not add `container_name`; use Compose project-name isolation for dev/prod.
- API folder naming:
  - Rename current `ml/serving/` package to `ml/api/`.
  - Update FastAPI import paths from `serving.*` to `api.*`.
  - Update Dockerfile/Compose/root scripts/tests/docs that point to `serving.main:app`.
  - Keep `ml-api` as the only FastAPI lifecycle.
- Runtime topology:
  - `ml-api` is the FastAPI control/debug/status service only.
  - `ml-worker` is the long-running stream consumer/client. It receives camera or gateway-provided RTSP streams and may consume synthetic RTSP only when a dev/test harness supplies it.
  - `training` remains batch artifact lifecycle and must not be imported by worker runtime.
- YAML-only worker config:
  - Canonical example: `ml/config/ml-worker.example.yaml`.
  - Runtime secret target: `/run/secrets/ml-worker.yaml`.
  - `EDGE_CAMERA_CONFIG` points to YAML.
  - `.json` config is rejected with `EdgeWorkerConfigError`; no compatibility fallback.
- Exact canonical YAML object schema:
  ```yaml
  version: 1
  ingest:
    alert_api_url: "https://backend.example.com/ingest/alerts"
    heartbeat_api_url: "https://backend.example.com/ingest/heartbeat"
  runtime:
    max_failures: 30
    open_timeout_ms: 5000
    read_timeout_ms: 5000
  cameras:
    - camera_id: "camera-1"
      facility_id: "facility-demo"
      resident_id: "resident-1"
      rtsp_url: "rtsp://camera-1.example.local:554/trackID=2"
      ingest_key_id: "camera-1-key-id"
      ingest_secret: "replace-with-camera-1-secret"
      heartbeat_interval_sec: 30
      frame_stride: 1
      label: "Room 1"
  models:
    pose:
      type: yolo-pose
      artifact: "/app/models/pose/yolo26n-pose.pt"
    bed:
      type: yolo-bed-seg
      artifact: "/app/models/bed/yolo26m-seg.pt"
    fall:
      type: lstm
      framework: pytorch
      mode: sequence
      artifact_dir: "/app/models/fall/lstm"
      weights: "model.pt"
      architecture: "arch.json"
      metadata: "metadata.yaml"
      window: 30
      stride: 5
      input_shape: [30, 51]
      operating_threshold: 0.5
  domains:
    enabled: ["fall", "bed_exit"]
  ```
- Pydantic config models use `extra="forbid"` for new YAML sections. `runtime` may contain only `max_failures`, `open_timeout_ms`, and `read_timeout_ms`.
- `domains.enabled` is a list of known domain registry names. If omitted, use existing registry defaults. If present, instantiate exactly those known domains; unknown names fail config validation.
- LSTM runtime:
  - Add production-safe runtime runner under `ml/runners/torch_lstm_fall.py`.
  - Do not import `ml/training` from worker/runtime.
  - Load `model.pt`, `arch.json`, and `metadata.yaml`.
  - Satisfy `FallModelProtocol`: `operating_threshold` and `predict(...) -> float`.
  - Missing/mismatched artifact raises typed startup error before frames are processed.
- Worker resource semantics:
  - Share heavy/stateless pose, bed, and loaded fall model resources where safe.
  - Create `FallWindowClassifier` per camera.
  - Create domain detector instances per camera.
- Normal fall chain:
  - camera or dev harness supplies RTSP stream
  - worker-side RTSP consumer source
  - `CameraWorker`
  - pose observation
  - LSTM fall probability
  - `FallWindowClassifier`
  - `FallEventLatch`
  - `EdgeIngestClient`
  - backend-shaped `/ingest/*` payload
- Final QA must run worker entrypoint from YAML, load a generated real LSTM artifact, consume RTSP-shaped input, and record heartbeat plus fall alert.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not embed an RTSP server or publisher in `ml-worker`.
- Must not route live RTSP frames or model selection through FastAPI.
- Must not add a second FastAPI app in `worker`.
- Must not silently fall back from YAML to JSON, LSTM to random forest, or `metadata.yaml` to `metadata.json`.
- Must not fake LSTM runner/model, `FallWindowClassifier`, `FallEventLatch`, domain registry, worker CLI, or ingest client in final QA.
- Must not change backend alert policy, Kakao delivery, DB schema, frontend, or Streamlit UX.
- Must not commit production RTSP URLs, ingest secrets, or real model weights.
- Must not broadly reorganize `ml/training`, `ml/demo`, or unrelated model families.
- Must not move `runtime/`, `sources/`, `runners/`, `domains/`, `events/`, `contracts/`, `features/`, or `perception/` under `worker/` in this plan.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD with `pytest`; behavior-changing work starts with failing tests before implementation.
- Evidence paths:
  - `.omo/evidence/task-0-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-1-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-2-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-3-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-4-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-5-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-6-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-7-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-8-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-9-ml-worker-lstm-yaml-contract.txt`
  - `.omo/evidence/task-10-ml-worker-lstm-yaml-contract.txt`
- Final QA policy:
  - RTSP input may be synthetic via MediaMTX/script harness.
  - Ingest may be backend-shaped stub.
  - Pose runner may be deterministic fixture only because committed YOLO weights are absent.
  - LSTM runner/model artifact, `FallWindowClassifier`, `FallEventLatch`, domain registry, worker CLI, and ingest client must be production code.
  - Run at least 35 frames per camera so `window=30` and `stride=5` can produce a fall decision.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 0: promote this plan to repo-canonical `docs/exec-plan/active/` before product implementation.
- Wave 1: lock naming/topology, perform narrow `serving/ -> api/` rename, YAML config contract, LSTM manifest contract, and per-camera state regression.
- Wave 2: implement YAML loader/model runner/worker wiring and update RTSP smoke harness.
- Wave 3: align docs/runbooks and run full verification.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 0 | none | 1-10 | none |
| 1 | 0 | 7, 8, 9, F3 | 2, 3, 4, 10 |
| 2 | 0 | 5, 6, 7, 8 | 1, 3, 4, 10 |
| 3 | 0 | 5, 6, 7 | 1, 2, 4, 10 |
| 4 | 0 | 6, 7 | 1, 2, 3, 10 |
| 5 | 2, 3 | 6, 7 | none |
| 6 | 2, 3, 4, 5 | 7, 8 | none |
| 7 | 1, 2, 3, 5, 6 | 8, F3 | none |
| 8 | 1, 2, 6, 7, 10 | 9, F1-F4 | none |
| 9 | 8 | F1-F4 | none |
| 10 | 0 | 1, 8, F2 | 1, 2, 3, 4 |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 0. Promote this plan into repo-canonical exec-plan before product implementation
  What to do / Must NOT do: Create `docs/exec-plan/active/ml-worker-lstm-yaml-contract/spec.md` and `docs/exec-plan/active/ml-worker-lstm-yaml-contract/plan.md` from this `.omo` plan and draft. Preserve the runtime topology decisions exactly. Do not archive or modify unrelated exec plans.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 1-10
  References (executor has NO interview context - be exhaustive): `AGENTS.md` plan-first mandate; `.omo/plans/ml-worker-lstm-yaml-contract.md`; `.omo/drafts/ml-worker-lstm-yaml-contract.md`; `ml/AGENTS.md:22-31`.
  Acceptance criteria (agent-executable): `test -f docs/exec-plan/active/ml-worker-lstm-yaml-contract/plan.md && test -f docs/exec-plan/active/ml-worker-lstm-yaml-contract/spec.md` exits 0; `rg -n "slug: ml-worker-lstm-yaml-contract|ml-worker-lstm-yaml-contract|ml-worker.*RTSP.*consumer" docs/exec-plan/active/ml-worker-lstm-yaml-contract` finds matching contract text.
  QA scenarios (name the exact tool + invocation): Happy CLI: `test -f docs/exec-plan/active/ml-worker-lstm-yaml-contract/plan.md && test -f docs/exec-plan/active/ml-worker-lstm-yaml-contract/spec.md > .omo/evidence/task-0-ml-worker-lstm-yaml-contract.txt`. Failure CLI: `test ! -e docs/exec-plan/active/wrong-ml-worker-plan >> .omo/evidence/task-0-ml-worker-lstm-yaml-contract.txt`.
  Commit: Y | `docs(ml): record ml worker LSTM YAML plan`

- [ ] 1. Normalize ML runtime naming and topology contracts without behavior changes
  What to do / Must NOT do: Update root scripts, Compose service names, topology tests, and directly related docs so canonical names are `ml-api`, `ml-worker`, `dev:ml-api`, and `dev:ml-worker`. Remove `dev:ml`. Do not keep fallback aliases. Do not add `container_name`. Assert `ml-worker` is an RTSP consumer, not an RTSP server/publisher, and `ml-api` is the only FastAPI process. Do not move non-API runtime packages in this task.
  Parallelization: Wave 1 | Blocked by: 0 | Blocks: 7, 8, 9, F3
  References (executor has NO interview context - be exhaustive): `package.json:13-14`; `compose.edge.yaml:11-63`; `ml/AGENTS.md:22-31`; `ml/tests/test_edge_topology_contract.py`; `ml/tests/test_worker_entrypoint.py`; `README.md:37-88`; `ml/README.md:44-75`; Docker Compose project names docs; Docker Compose `container_name` docs.
  Acceptance criteria (agent-executable): `uv run --directory ml pytest tests/test_edge_topology_contract.py tests/test_worker_entrypoint.py` exits 0 and asserts canonical names exist, `dev:ml` is absent, no Compose service sets `container_name`, and worker docs/tests describe RTSP consumption rather than RTSP publishing.
  QA scenarios (name the exact tool + invocation): Happy CLI: `tmpdir="$(mktemp -d)"; cp ml/config/ml-worker.example.yaml "$tmpdir/ml-worker.yaml"; pnpm -s run dev:ml-worker -- --config "$tmpdir/ml-worker.yaml" --check-config > .omo/evidence/task-1-ml-worker-lstm-yaml-contract.txt` PASS when stdout reports ok/camera count. Failure CLI: `pnpm -s run dev:ml -- --help >> .omo/evidence/task-1-ml-worker-lstm-yaml-contract.txt 2>&1`; PASS when command fails because `dev:ml` is no longer a script.
  Commit: Y | `chore(ml): clarify api and worker runtime names`

- [ ] 10. Rename FastAPI package from serving to api without changing API behavior
  What to do / Must NOT do: Rename `ml/serving/` to `ml/api/` and update all imports, tests, Docker commands, root scripts, Compose commands, and docs that reference `serving.*` or `serving.main:app`. Preserve FastAPI route behavior and module contents except import paths. Do not move `runtime/`, `sources/`, `runners/`, `domains/`, `events/`, `contracts/`, `features/`, or `perception/` under `worker/`; that broader restructuring is deferred.
  Parallelization: Wave 1 | Blocked by: 0 | Blocks: 1, 8, F2
  References (executor has NO interview context - be exhaustive): `ml/serving/main.py`; `ml/serving/routes/`; `ml/serving/lifespan.py`; `ml/serving/pipeline.py`; `package.json:13`; `compose.edge.yaml:25`; `ml/Dockerfile.api`; `ml/tests/test_serving_api.py`; `ml/tests/test_serving_health.py`; `ml/tests/test_serving_status.py`; `ml/tests/test_serving_debug_predict.py`; `ml/tests/test_import_dependency_ladder.py:7-152`.
  Acceptance criteria (agent-executable): FastAPI tests pass after import path update: `uv run --directory ml pytest tests/test_serving_api.py tests/test_serving_health.py tests/test_serving_status.py tests/test_serving_debug_predict.py tests/test_import_dependency_ladder.py` exits 0; `rg -n "serving\\.main|from serving|import serving|ml/serving" package.json compose.edge.yaml ml/Dockerfile.api ml tests README.md docs/runbooks` exits 1 except archived historical plans if intentionally excluded.
  QA scenarios (name the exact tool + invocation): Happy CLI: `uv run --directory ml pytest tests/test_serving_health.py::test_health_live -q > .omo/evidence/task-10-ml-worker-lstm-yaml-contract.txt` PASS on exit 0 and ASGI health route still works after the package rename. Failure CLI: `uv run --directory ml python -c "import serving.main" >> .omo/evidence/task-10-ml-worker-lstm-yaml-contract.txt 2>&1`; PASS when exit code is nonzero because old package path is gone.
  Commit: Y | `refactor(ml): rename serving package to api`

- [ ] 2. Introduce YAML-only ml-worker runtime config contract
  What to do / Must NOT do: Replace JSON example/config references with `ml/config/ml-worker.example.yaml` and `/run/secrets/ml-worker.yaml`. Add Pydantic models for `version`, `ingest`, `runtime`, `cameras`, `models`, and `domains`. Validate RTSP URL, ingest endpoint suffixes, duplicate camera IDs, allowed runtime keys, known domain names, and strict extra fields. Reject `.json` config with typed `EdgeWorkerConfigError`; do not keep JSON compatibility.
  Parallelization: Wave 1 | Blocked by: 0 | Blocks: 5, 6, 7, 8
  References (executor has NO interview context - be exhaustive): `ml/runtime/edge_worker_config.py:37-130`; `ml/config/edge-cameras.example.json`; `ml/tests/test_edge_worker_config.py`; `ml/tests/test_edge_worker_cli.py`; `compose.edge.yaml:47-63`; PyYAML safe-load docs; Pydantic validation docs.
  Acceptance criteria (agent-executable): Add failing-first `ml/tests/test_ml_worker_yaml_config.py`. After implementation, `uv run --directory ml pytest tests/test_edge_worker_config.py tests/test_edge_worker_cli.py tests/test_ml_worker_yaml_config.py` exits 0, and topology tests prove Compose uses `/run/secrets/ml-worker.yaml`.
  QA scenarios (name the exact tool + invocation): Happy CLI: `tmpdir="$(mktemp -d)"; cp ml/config/ml-worker.example.yaml "$tmpdir/ml-worker.yaml"; EDGE_CAMERA_CONFIG="$tmpdir/ml-worker.yaml" uv run --directory ml python -m runtime.edge_worker_config --check > .omo/evidence/task-2-ml-worker-lstm-yaml-contract.txt` PASS when output says config ok with expected camera count. Failure CLI: `tmpdir="$(mktemp -d)"; printf '{"cameras":[]}' > "$tmpdir/bad.json"; EDGE_CAMERA_CONFIG="$tmpdir/bad.json" uv run --directory ml python -m runtime.edge_worker_config --check >> .omo/evidence/task-2-ml-worker-lstm-yaml-contract.txt 2>&1`; PASS when exit code is 2 and error says JSON config is rejected.
  Commit: Y | `feat(ml): make worker config YAML only`

- [ ] 3. Add strict LSTM fall model manifest contract
  What to do / Must NOT do: Add runtime-facing manifest validation for `models.fall` and artifact-side `metadata.yaml`. It must pin `type: lstm`, `framework: pytorch`, `mode: sequence`, `artifact_dir`, `weights: model.pt`, `architecture: arch.json`, `metadata: metadata.yaml`, `window`, `stride`, `input_shape`, and `operating_threshold`. Do not read `metadata.json`. Do not accept `random-forest` when YAML says LSTM.
  Parallelization: Wave 1 | Blocked by: 0 | Blocks: 5, 6, 7
  References (executor has NO interview context - be exhaustive): `ml/training/models/catalog.py:50-55`; `ml/training/models/lstm.py:45-72`; `ml/training/models/base.py:111-138`; `ml/training/metadata.py:25-81`; `ml/tests/test_training_models.py`; `ml/tests/test_models_layout.py`; PyTorch `state_dict` save/load docs.
  Acceptance criteria (agent-executable): New `ml/tests/test_lstm_model_manifest.py` proves valid YAML LSTM manifest loads into a typed runtime contract; missing `model.pt`, missing `metadata.yaml`, wrong `input_shape`, or `framework: sklearn` fail before frame processing. `uv run --directory ml pytest tests/test_models_layout.py tests/test_training_models.py tests/test_lstm_model_manifest.py` exits 0.
  QA scenarios (name the exact tool + invocation): Happy CLI: `uv run --directory ml pytest tests/test_lstm_model_manifest.py::test_lstm_manifest_accepts_metadata_yaml -q > .omo/evidence/task-3-ml-worker-lstm-yaml-contract.txt` PASS on exit 0. Failure CLI: `uv run --directory ml pytest tests/test_lstm_model_manifest.py::test_lstm_manifest_rejects_metadata_json_fallback -q >> .omo/evidence/task-3-ml-worker-lstm-yaml-contract.txt` PASS on exit 0 because the test asserts rejection.
  Commit: Y | `feat(ml): define LSTM fall artifact manifest`

- [ ] 4. Lock per-camera temporal and domain state before worker refactor
  What to do / Must NOT do: Add a failing regression test proving two cameras cannot share `FallWindowClassifier` tracker/window/probability state or domain detector instances. Then refactor only the resource boundary needed so heavy model weights/runners can be shared while stateful classifiers/detectors are per-camera. Do not duplicate pose/bed runners unless tests prove they are unsafe.
  Parallelization: Wave 1 | Blocked by: 0 | Blocks: 6, 7
  References (executor has NO interview context - be exhaustive): `ml/worker/edge_worker.py:44-179`; `ml/runtime/fall_window_classifier.py:35-114`; `ml/runtime/camera_worker.py:36-112`; `ml/domains/fall/detector.py:8-72`; `ml/tests/test_worker_runner_sharing.py`; `ml/tests/test_worker_fall_model_wiring.py`.
  Acceptance criteria (agent-executable): New `ml/tests/test_worker_per_camera_fall_state.py` turns green; existing runner-sharing tests still prove pose/bed reuse. Run `uv run --directory ml pytest tests/test_worker_runner_sharing.py tests/test_worker_fall_model_wiring.py tests/test_worker_per_camera_fall_state.py` and exit 0.
  QA scenarios (name the exact tool + invocation): Happy CLI: `uv run --directory ml pytest tests/test_worker_per_camera_fall_state.py::test_fall_classifier_state_is_per_camera -q > .omo/evidence/task-4-ml-worker-lstm-yaml-contract.txt` PASS on exit 0. Failure scenario: capture the same test RED before production change in the same evidence file.
  Commit: Y | `fix(ml): isolate per-camera fall state`

- [ ] 5. Implement runtime LSTM fall runner without importing training
  What to do / Must NOT do: Add `ml/runners/torch_lstm_fall.py` with a production-safe loader for `model.pt`, `arch.json`, and `metadata.yaml`. The runner must satisfy `FallModelProtocol`, return clipped probabilities in `[0,1]`, validate input shape, and raise typed `ModelLoadError` or equivalent. It may define a small runtime `_LstmNet` matching the training artifact architecture, but worker/runtime must not import `ml/training`.
  Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: 6, 7
  References (executor has NO interview context - be exhaustive): `ml/runners/registry.py:20-49`; `ml/runners/sklearn_fall.py:93-169`; `ml/runtime/fall_window_classifier.py:22-33`; `ml/training/models/lstm.py:45-72`; `ml/training/models/base.py:111-138`; `ml/pyproject.toml:12-39`; `ml/Dockerfile.worker`.
  Acceptance criteria (agent-executable): New `ml/tests/test_runners_torch_lstm_fall.py` first fails because no runtime runner exists. After implementation, generated tiny LSTM artifact loads and predicts a float probability. Run `uv run --directory ml pytest tests/test_runners_registry.py tests/test_runners_torch_lstm_fall.py` and exit 0.
  QA scenarios (name the exact tool + invocation): Happy CLI: `uv run --directory ml pytest tests/test_runners_torch_lstm_fall.py::test_lstm_runner_loads_generated_artifact_and_predicts_probability -q > .omo/evidence/task-5-ml-worker-lstm-yaml-contract.txt` PASS on exit 0. Failure CLI: `uv run --directory ml pytest tests/test_runners_torch_lstm_fall.py::test_lstm_runner_rejects_wrong_input_shape -q >> .omo/evidence/task-5-ml-worker-lstm-yaml-contract.txt` PASS on exit 0 because the test asserts explicit rejection.
  Commit: Y | `feat(ml): load LSTM fall runner at runtime`

- [ ] 6. Wire YAML-selected models and domains into ml-worker
  What to do / Must NOT do: Change `_build_supervisor` and `_worker` so typed YAML config constructs shared pose/bed/fall model resources, creates per-camera `FallWindowClassifier`, instantiates only YAML-enabled domains, preserves `EdgeIngestClient`, and converts config/model startup failures to exit code 2 with concise stderr. Do not route model selection through FastAPI. Do not remove `--check-config`, `--heartbeat-on-start`, or `--max-frames-per-camera`.
  Parallelization: Wave 2 | Blocked by: 2, 3, 4, 5 | Blocks: 7, 8
  References (executor has NO interview context - be exhaustive): `ml/worker/edge_worker.py:52-191`; `ml/runtime/camera_worker.py:36-112`; `ml/domains/__init__.py`; `ml/domains/fall/detector.py:8-72`; `ml/events/edge_ingest_client.py`; `ml/tests/test_edge_worker_four_streams.py`; `ml/tests/test_worker_backend_ingest_contract.py`.
  Acceptance criteria (agent-executable): Worker CLI can `--check-config` YAML; finite run with deterministic source/model emits fall event through existing sink path; disabled domain in YAML is not instantiated. Run `uv run --directory ml pytest tests/test_edge_worker_cli.py tests/test_edge_worker_four_streams.py tests/test_worker_backend_ingest_contract.py tests/test_domain_registry_scaffolds_disabled.py tests/test_ml_worker_yaml_runtime.py` and exit 0.
  QA scenarios (name the exact tool + invocation): Happy CLI: `uv run --directory ml pytest tests/test_ml_worker_yaml_runtime.py::test_worker_yaml_lstm_runtime_emits_fall_event -q > .omo/evidence/task-6-ml-worker-lstm-yaml-contract.txt` PASS on exit 0. Failure CLI: `uv run --directory ml pytest tests/test_ml_worker_yaml_runtime.py::test_worker_exits_nonzero_when_lstm_artifact_missing -q >> .omo/evidence/task-6-ml-worker-lstm-yaml-contract.txt` PASS on exit 0 because the test asserts explicit startup error.
  Commit: Y | `feat(ml): run worker from YAML model and domain config`

- [ ] 7. Update synthetic and real RTSP smoke surfaces as external input harnesses
  What to do / Must NOT do: Update `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh` and `scripts/ml-edge-four-rtsp-smoke.sh` to use canonical YAML config and `ml-worker` service/entrypoint names. The mock script may start MediaMTX/synthetic RTSP publishers outside the worker runtime, but worker code must only consume those streams. The script must generate a valid LSTM artifact under temp `ML_MODELS_DIR`, run at least 35 frames per camera, and prove heartbeat plus fall alert. It may use deterministic pose fixture; it must not fake LSTM runner, classifier, latch, domain registry, worker CLI, or ingest client.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3, 5, 6 | Blocks: 8, F3
  References (executor has NO interview context - be exhaustive): `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh`; `scripts/ml-edge-four-rtsp-smoke.sh`; `docs/runbooks/idis-camera-rtsp.md:121-178`; `compose.edge.yaml:41-63`; `ml/config/edge-cameras.example.json`.
  Acceptance criteria (agent-executable): `scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh` writes YAML, uses `ML_MODELS_DIR`, creates `fall/lstm/model.pt`, `arch.json`, and `metadata.yaml`, runs product-shaped worker, and records heartbeat plus fall alert. Real-camera smoke rejects missing/non-YAML config clearly.
  QA scenarios (name the exact tool + invocation): Docker real-surface: `COMPOSE_PROJECT_NAME=ml-worker-lstm-yaml-contract MAX_FRAMES_PER_CAMERA=35 scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh > .omo/evidence/task-7-ml-worker-lstm-yaml-contract.txt 2>&1` PASS when output includes ingest records ok and a fall alert payload. Failure CLI: `tmpdir="$(mktemp -d)"; printf 'version: 1\n' > "$tmpdir/bad.yaml"; EDGE_CAMERA_CONFIG="$tmpdir/bad.yaml" scripts/ml-edge-four-rtsp-smoke.sh >> .omo/evidence/task-7-ml-worker-lstm-yaml-contract.txt 2>&1` PASS when exit code is nonzero before worker start and error names config/ffprobe failure.
  Commit: Y | `test(ml): prove LSTM worker through RTSP harness`

- [ ] 8. Align README/runbooks with the ml-worker mental model
  What to do / Must NOT do: Update only directly relevant README, `ml/README.md`, and RTSP/demo runbooks so they say: `ml-api` is local control/status FastAPI under `ml/api/`; `ml-worker` consumes configured RTSP streams and owns inference; dev RTSP publishers are external harnesses; YAML is canonical; LSTM is the configured fall model; missing artifacts fail honestly; broad worker/shared/runtime restructuring is deferred. Do not rewrite unrelated docs or archive old plans.
  Parallelization: Wave 3 | Blocked by: 1, 2, 6, 7, 10 | Blocks: 9, F1-F4
  References (executor has NO interview context - be exhaustive): `README.md:37-88`; `ml/README.md:1-75`; `docs/runbooks/thursday-mvp-demo.md:38-50`; `docs/runbooks/idis-camera-rtsp.md:121-178`; `docs/runbooks/live-fall-to-kakao-workflow.md:113-127`; `ml/AGENTS.md:22-31`.
  Acceptance criteria (agent-executable): Docs reference `dev:ml-api`, `dev:ml-worker`, `ml-api`, `ml-worker`, and `ml/config/ml-worker.example.yaml`; docs do not present worker as RTSP publisher/server. Run `uv run --directory ml pytest tests/test_edge_topology_contract.py tests/test_edge_worker_config.py tests/test_edge_worker_cli.py tests/test_ml_worker_yaml_config.py` and targeted `uv run --directory ml ruff check .`.
  QA scenarios (name the exact tool + invocation): CLI/docs contract: `rg -n "dev:ml($|[[:space:]\"',])|ml-edge-api\\b|ml-edge-worker\\b|edge-cameras\\.example\\.json|edge-cameras\\.local\\.json|worker.*RTSP server|worker.*publisher|serving\\.main|ml/serving" README.md ml/README.md docs/runbooks scripts package.json compose.edge.yaml ml/Dockerfile.api > .omo/evidence/task-8-ml-worker-lstm-yaml-contract.txt` PASS when command exits 1 with no stale canonical references. Failure scenario: run same grep before docs update and capture stale hits.
  Commit: Y | `docs(ml): document worker RTSP consumer runtime`

- [ ] 9. Add guard coverage for ML-local agent rules and runtime boundaries
  What to do / Must NOT do: Add or update lightweight tests/contract checks so future edits do not drift back to ambiguous names, JSON config, worker FastAPI, or RTSP publisher semantics. Keep this as guard coverage only; do not build a new lint framework.
  Parallelization: Wave 3 | Blocked by: 8 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `ml/AGENTS.md:22-31`; `ml/tests/test_import_dependency_ladder.py`; `ml/tests/test_edge_topology_contract.py`; `package.json`; `compose.edge.yaml`; `ml/worker`; `ml/api`.
  Acceptance criteria (agent-executable): `uv run --directory ml pytest tests/test_import_dependency_ladder.py tests/test_edge_topology_contract.py` exits 0 and asserts worker does not import `api`, api does not import `training`, canonical names are present, stale names/configs are absent, and broad runtime packages remain outside `worker/`.
  QA scenarios (name the exact tool + invocation): Happy CLI: `uv run --directory ml pytest tests/test_import_dependency_ladder.py tests/test_edge_topology_contract.py -q > .omo/evidence/task-9-ml-worker-lstm-yaml-contract.txt` PASS on exit 0. Failure CLI: `rg -n "from serving|import serving|uvicorn|FastAPI" ml/worker >> .omo/evidence/task-9-ml-worker-lstm-yaml-contract.txt`; PASS when command exits 1.
  Commit: Y | `test(ml): guard worker runtime boundaries`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  Command/evidence: `git diff -- . ':(exclude).omo' > .omo/evidence/final-diff-ml-worker-lstm-yaml-contract.patch` then inspect every changed product file against this plan. PASS only if every changed file traces to a todo and no guardrail is violated.
- [ ] F2. Code quality review
  Command/evidence: `uv run --directory ml pytest tests/test_edge_worker_config.py tests/test_edge_worker_cli.py tests/test_edge_topology_contract.py tests/test_worker_runner_sharing.py tests/test_worker_fall_model_wiring.py tests/test_sources_rtsp.py tests/test_worker_backend_ingest_contract.py tests/test_ml_worker_yaml_config.py tests/test_lstm_model_manifest.py tests/test_runners_torch_lstm_fall.py tests/test_worker_per_camera_fall_state.py tests/test_ml_worker_yaml_runtime.py tests/test_import_dependency_ladder.py tests/test_serving_api.py tests/test_serving_health.py tests/test_serving_status.py tests/test_serving_debug_predict.py` plus `EDGE_CAMERA_CONFIG=ml/config/ml-worker.example.yaml docker compose -f compose.edge.yaml build ml-api ml-worker`. Capture to `.omo/evidence/final-pytest-ml-worker-lstm-yaml-contract.txt` and `.omo/evidence/final-docker-build-ml-worker-lstm-yaml-contract.txt`. PASS only on exit 0.
- [ ] F3. Real manual QA
  Command/evidence: `COMPOSE_PROJECT_NAME=ml-worker-lstm-yaml-contract MAX_FRAMES_PER_CAMERA=35 scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh > .omo/evidence/final-docker-rtsp-ml-worker-lstm-yaml-contract.txt 2>&1`. PASS only if the product-shaped worker consumes RTSP-shaped input and emits heartbeat plus fall alert ingest record. If Docker unavailable, mark blocked; do not replace with unit tests.
- [ ] F4. Scope fidelity
  Command/evidence: `git diff --name-only > .omo/evidence/final-scope-ml-worker-lstm-yaml-contract.txt`. PASS only if no backend/frontend/Streamlit/DB/Kakao files changed except direct docs references explicitly allowed above.

## Commit strategy
- Commit 0 or included in Commit 1: `docs(ml): record ml worker LSTM YAML plan`
- Commit 1: `chore(ml): clarify api and worker runtime names`
- Commit 1b: `refactor(ml): rename serving package to api`
- Commit 2: `feat(ml): make worker config YAML only`
- Commit 3: `feat(ml): define LSTM fall artifact manifest`
- Commit 4: `fix(ml): isolate per-camera fall state`
- Commit 5: `feat(ml): load LSTM fall runner at runtime`
- Commit 6: `feat(ml): run worker from YAML model and domain config`
- Commit 7: `test(ml): prove LSTM worker through RTSP harness`
- Commit 8: `docs(ml): document worker RTSP consumer runtime`
- Commit 9: `test(ml): guard worker runtime boundaries`
- Do not auto-commit unless the user explicitly asks. If committing later, each commit must pass its todo-local tests before the next commit.

## Success criteria
- `ml-api`, `ml-worker`, `dev:ml-api`, and `dev:ml-worker` are canonical; `dev:ml`, `ml-edge-api`, and `ml-edge-worker` are gone from canonical surfaces.
- FastAPI code lives under `ml/api/`; `ml/serving/` and `serving.main:app` references are gone from canonical surfaces.
- Broad worker/runtime package relocation is explicitly deferred; `runtime/`, `sources/`, `runners/`, `domains/`, `events/`, `contracts/`, `features/`, and `perception/` remain top-level ML packages in this plan.
- `docs/exec-plan/active/ml-worker-lstm-yaml-contract/` exists before product implementation.
- `ml-worker` is documented and tested as an RTSP stream consumer, not an RTSP server/publisher.
- Worker config is YAML-only and validates with typed errors.
- YAML pins LSTM/PyTorch fall model contract and rejects missing/mismatched artifacts before processing frames.
- Worker loads LSTM artifact and emits a fall event through the normal domain path.
- `FallWindowClassifier` and domain detector state are per-camera; heavy model artifacts/runners remain shared where safe.
- Synthetic Docker RTSP harness produces backend-shaped heartbeat and fall alert evidence without faking the LSTM/domain/ingest chain.
- No secrets, real RTSP credentials, backend policy changes, frontend changes, DB changes, Streamlit UX changes, or FastAPI raw-frame relay are introduced.
