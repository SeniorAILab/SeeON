---
slug: ml-worker-lstm-yaml-contract
status: done
intent: clear
pending-action: write .omo/plans/ml-worker-lstm-yaml-contract.md
approach: Make ml-api/ml-worker/training boundaries explicit, make ml-worker consume configured RTSP streams from YAML, load a YAML-pinned LSTM fall model, preserve per-camera temporal state, and prove the normal worker/domain/ingest path emits a real fall event from RTSP-shaped input.
---

# Draft: ml-worker-lstm-yaml-contract

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| C1 | ML process and dev/Docker names distinguish `ml-api`, `ml-worker`, and `training` | active | package.json:13-14; compose.edge.yaml:11-63; ml/AGENTS.md:22-31 |
| C2 | RTSP contract is YAML-authored, Pydantic-validated, and describes camera/gateway streams consumed by worker | active | ml/runtime/edge_worker_config.py:37-130; ml/config/edge-cameras.example.json; ml/sources/rtsp.py:15-58 |
| C3 | Fall model contract is YAML-authored and pins LSTM/PyTorch runtime artifacts | active | ml/training/models/catalog.py:50-55; ml/training/models/lstm.py:45-72; ml/training/models/base.py:111-138 |
| C4 | `ml-worker` shares heavy model runners but isolates per-camera temporal/domain state | active | ml/worker/edge_worker.py:122-179; ml/runtime/fall_window_classifier.py:35-114 |
| C5 | Worker execution reaches fall domain event and backend-shaped ingest from RTSP-shaped input | active | ml/runtime/camera_worker.py:36-112; ml/domains/fall/detector.py:8-72; scripts/ml-edge-four-mock-rtsp-ingest-e2e.sh |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Runtime naming | Use `ml-api` and `ml-worker`; root scripts are `dev:ml-api` and `dev:ml-worker`; remove ambiguous `dev:ml`; no aliases | User explicitly rejected fallback naming and requested `ml-*` role naming | Yes |
| API folder rename | Rename current `ml/serving/` to `ml/api/` in this plan | User accepted that small rename because it aligns folder, service, and script names without moving the whole worker runtime tree | Yes |
| Broad folder restructure | Defer moving `runtime/`, `sources/`, `runners/`, `domains/`, and `events/` under `worker/` | Best-practice research showed full 1-depth restructuring is higher churn than the current RTSP/LSTM goal needs | Yes |
| RTSP direction | Worker is a stream consumer/client. Dev RTSP publishers/routers live only in scripts/tests/harnesses | User corrected that worker does not provide RTSP; it receives a stream offered by camera/gateway/dev harness | Yes |
| YAML migration | YAML is the only worker runtime config; JSON config is rejected | User rejected fallback; strict config avoids split contracts | Yes |
| LSTM contract | Runtime artifact is `model.pt` + `arch.json` + `metadata.yaml`; worker does not read `metadata.json` fallback | User selected LSTM and YAML; strict artifact contract keeps startup failures honest | Yes |
| FastAPI role | FastAPI remains only in `ml-api`; no second FastAPI app in `ml-worker` | `ml/AGENTS.md` runtime topology locks this boundary | Yes |

## Findings (cited - path:lines)
- Current root scripts still use `dev:ml` for FastAPI and `dev:ml-worker` for worker. See `package.json:13-14`.
- Current FastAPI package is `ml/serving/`, but the target service name is `ml-api`, so a narrow `serving/ -> api/` rename aligns code layout with runtime naming. See `ml/serving/main.py`, `ml/serving/routes/`, and `ml/tests/test_serving_*.py`.
- Current lower-level runtime packages (`contracts`, `features`, `sources`, `runners`, `perception`, `domains`, `runtime`, `events`) are already guarded by an import ladder; moving all of them under `worker/` would be broad churn outside the immediate RTSP/LSTM proof. See `ml/AGENTS.md:7-19` and `ml/tests/test_import_dependency_ladder.py:7-152`.
- Current Compose services are `ml-edge-api` and `ml-edge-worker`, and worker secret/config is JSON. See `compose.edge.yaml:11-63`.
- `ml/AGENTS.md` defines `ml-api` as FastAPI control/debug/status, `ml-worker` as RTSP stream consumer, and `training` as artifact lifecycle. See `ml/AGENTS.md:22-31`.
- Current config loader is JSON-only: `load_edge_worker_config` calls `json.loads` and validates `EdgeWorkerConfig`. See `ml/runtime/edge_worker_config.py:119-130`.
- Current camera config validates `rtsp_url`, ingest URLs, duplicate camera IDs, heartbeat interval, and stride. See `ml/runtime/edge_worker_config.py:37-117`.
- `RTSPSource` is a consumer source using `OpenCVRTSPBackend`; it is not a server/publisher. See `ml/sources/rtsp.py:15-58` and `ml/sources/rtsp_backend.py:33-70`.
- `ml-worker` currently creates one shared `_WorkerResources` with one shared `FallWindowClassifier`, then injects that into every camera worker. See `ml/worker/edge_worker.py:122-179`.
- `FallWindowClassifier` is stateful: it owns tracker, frame buffers, last probabilities, and frame counter. See `ml/runtime/fall_window_classifier.py:35-114`.
- Current model registry maps `fall` to random-forest serving implementation, while LSTM exists only in training code. See `ml/runners/registry.py:20-49`, `ml/runners/sklearn_fall.py:93-169`, and `ml/training/models/lstm.py:45-72`.
- Worker Docker image copies runtime packages but not `training`, so runtime LSTM code must live under production-safe packages such as `ml/runners`. See `ml/Dockerfile.worker`.
- Current runbooks and README still describe `ml-edge-*`, JSON config, and `dev:ml`; docs must be updated with new naming and the stream-consumer mental model. See `README.md:37-88`, `ml/README.md:44-75`, and `docs/runbooks/*`.

## Decisions (with rationale)
- D1: Canonical runtime names are `ml-api` and `ml-worker`; canonical dev scripts are `dev:ml-api` and `dev:ml-worker`. Remove ambiguous `dev:ml`; do not keep fallback aliases.
- D2: Rename `ml/serving/` to `ml/api/` now; update imports, Docker commands, tests, and docs in the same slice.
- D3: Defer broad 1-depth restructuring. Keep `runtime/`, `sources/`, `runners/`, `domains/`, `events/`, `contracts/`, `features/`, and `perception/` in place for this work.
- D4: `ml-worker` consumes configured RTSP streams. It must not embed an RTSP publisher/server. Synthetic publishers/MediaMTX belong in dev/test scripts only.
- D5: `ml-api` is the only FastAPI process. It provides control/debug/status surfaces and does not own live RTSP consumption, inference loops, or backend ingest side effects.
- D6: Worker runtime config becomes YAML-only with explicit `version`, `ingest`, `runtime`, `cameras`, `models`, and `domains` sections. JSON config is rejected.
- D7: Runtime fall model is LSTM/PyTorch when YAML says `models.fall.type: lstm`; missing or mismatched artifacts fail before frame processing. Do not silently fall back to random forest.
- D8: Add runtime LSTM fall runner under `ml/runners/torch_lstm_fall.py` or equivalent production-safe runner module; do not import `ml/training` from worker.
- D9: Share heavy loaded model instances/runners, but create `FallWindowClassifier` and domain detector instances per camera.
- D10: Final proof may use synthetic RTSP input and ingest stub, but must not fake LSTM runner, `FallWindowClassifier`, `FallEventLatch`, domain registry, worker CLI, or ingest client.

## Scope IN
- Promote the plan into `docs/exec-plan/active/ml-worker-lstm-yaml-contract/` before product implementation.
- Rename runtime/dev/Compose/docs from `ml-edge-*`/`dev:ml` to `ml-api`/`ml-worker` and `dev:ml-api`/`dev:ml-worker`.
- Rename `ml/serving/` to `ml/api/` and update import/test/Docker/docs references.
- YAML-only worker config and example file.
- Pydantic validation for config/model/domain sections.
- Runtime LSTM manifest validation and runner.
- Per-camera fall classifier and domain detector state.
- YAML-selected domain registry wiring.
- Synthetic RTSP + Docker/product-shaped E2E that emits heartbeat plus fall alert.
- Directly related README/runbook updates.

## Scope OUT (Must NOT have)
- No RTSP publisher/server inside `ml-worker`.
- No raw-frame relay through FastAPI.
- No second FastAPI app in `worker`.
- No JSON config or metadata fallback.
- No backend alert policy, Kakao, DB, frontend, Streamlit UX, or broad training redesign.
- No broad move of `runtime/`, `sources/`, `runners/`, `domains/`, `events/`, `contracts/`, `features/`, or `perception/` into `worker/` during this plan.
- No committed production RTSP URLs, ingest secrets, or model weights.
- No `container_name`.

## Open questions
- None blocking. The user selected `ml-worker`, RTSP consumer semantics, YAML-only config, no fallback, and LSTM.

## Approval gate
status: plan-written
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
