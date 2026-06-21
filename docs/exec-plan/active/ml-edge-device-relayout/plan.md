# FINAL (pending approval) — ML edge-device relayout execution plan

## Consensus record
- Run ID: 2026-06-20-1540-e5f3
- Source: deep-interview-ml-edge-device-relayout.md (ambiguity ~15%, BELOW_THRESHOLD) + ml-edge-device-relayout-notes.md
- Loop: planner -> architect BLOCK -> critic REJECT -> revision -> architect BLOCK(R1-R4) -> critic REJECT(C1-C8) -> revision2 -> architect CLEAR/APPROVE(stage-07) -> critic OKAY all-resolved(stage-08)
- Final verdicts: Architect = CLEAR / APPROVE; Critic = OKAY (all blockers resolved)
- Mode: deliberate (pre-mortem + expanded unit/integration/e2e/observability test plan)
- AC5 added per user requirement: every Streamlit demo button/feature must keep working on the real production code path.
- Status: PENDING APPROVAL. User pre-authorized execution-after-consensus -> handoff to ultragoal; execution in a separate clean worktree per docs/rules/worktree-workflow.md.

The approved plan body follows (identical to stage-05-revision).

---

# REVISED stage-05 ML edge-device relayout execution plan

## 1. RALPLAN-DR Summary

### Principles
1. Dependency ladder first, with explicit training exception: L0 contracts/features/artifacts first; L1 sources/runners next; L2 perception; L3 domains/runtime; L4 events; L5 serving/demo assembly. Training may import only training-local plus `contracts`, `features`, `sources`, and `runners`; it must not import `perception`, `domains`, `runtime`, `events`, `serving`, `demo`, `core`, or `util`.
2. Truthful guards: a guard activates only in the slice that makes the guarded condition true. Slice 2 severs serving-to-training and training-to-core/util before enabling the guard.
3. One real execution path: Streamlit demo controls must keep functioning and must keep using the production serving and alert path, not in-process shortcuts or mocks.
4. Shims are temporary and ledgered: every adapter has an introducing slice and removing slice or an ADR-retention criterion; Slice 11 enforces final deletion of `core/`, `util/`, and unresolved shims.
5. ADR-before-or-with-code: ADRs land with implementation-status clauses, and every code slice updates ADR status plus decision-index coverage incrementally.

### Decision Drivers
1. Reviewability and PR-size gate: target `size/M`; logic churn >1000 is a hard block; known large migrations are planned splits.
2. Continuous operability: pytest, serving routes, and every existing Streamlit demo button/feature remain functional after every relevant slice.
3. Minimal shim lifetime with DRY pose execution: training and runtime share `runners.yolo_pose` for pose execution, while pure model-artifact path helpers live in L0.

### Viable Options
- A. Strict bottom-up by dependency layer. Pros: clean ladder proof. Cons: product-path and demo functional evidence arrive late; horizontal migration can still balloon.
- B. Capability-vertical. Pros: early fall-path proof. Cons: pressures upward imports and duplicate temporary contracts, extending shim lifetime.
- C. Hybrid foundation-then-vertical. Pros: L0/L1 foundations and guards become true early, planned upper vertical slices prove fall and bed_exit behavior, and demo functional gates prevent regressions. Cons: needs explicit guard exceptions, ADR status tracking, and shim ledger discipline.

Recommendation: C, hybrid. A delays AC3/AC4/AC5 proof. B weakens the settled dependency ladder. C keeps the architecture provable and the demo usable.

## 2. Slice plan

### Global shim ledger for the parent issue
- `core.contract` adapter: introduced Slice 1, removed Slice 11.
- `util.frame_source` adapter: introduced Slice 1 and expanded Slice 3, removed Slice 11.
- legacy feature wrappers in `training.extract_poses` and `training.data.features`: introduced Slice 1 as delegating compatibility, removed or made non-canonical by Slice 2, fully dead-code-cleaned by Slice 11.
- `serving.source_registry` adapter: introduced Slice 3, removed Slice 11.
- `core.model_modules` and `core.yolo_runtime` adapters: introduced Slice 4, removed Slice 11.
- `core.bed_detector`, `core.classifiers`, and serving model adapters: introduced Slice 4, removed Slice 11.
- `core.tracking` adapter and DetectionResult compatibility shim: introduced Slice 5a, consumers migrated in Slice 5b, removed Slice 11.
- `core.bed_exit` adapter: introduced Slice 6, removed Slice 11.
- Slice 7 temporary serving/demo runtime adapters, if any: introduced Slice 7 only when required, removal slice must be recorded in the same PR; default removal is Slice 10 for demo adapters or Slice 11 for serving adapters.
- `core.alert_client` adapter: introduced Slice 8, removed Slice 11 after new events publisher/signing is wired.
- `core.serving_client` adapter: introduced when client moves in Slice 9; new home is `serving/client.py` for the real ML-serving HTTP client used by demo. Adapter removed Slice 11.
- temporary deprecated `/predict` alias: introduced Slice 9 only if needed for compatibility, removed Slice 11.
- `training.pose_runtime`: not used as end state and not retained. Stage-04 temporary-wrapper idea is replaced by narrow training-to-runners import. If a temporary helper appears during Slice 2, it must be deleted in Slice 4 before merge or the PR fails; no Slice 11 dependency on it is allowed.

### Demo functional gate used by all demo-backing slices
Run this command for every slice touching contracts, features, sources, runners, perception, domains, runtime, events, serving, or demo adapters:
`cd ml && uv run pytest tests/test_demo_app_controls.py tests/test_demo_video_registry.py tests/test_demo_yolo_overlay.py tests/test_demo_live_source_selection.py tests/test_demo_registry_catalog.py tests/test_demo_temporal_classifier.py tests/test_demo_tracking.py tests/test_demo_bed_detector.py tests/test_demo_bed_exit.py tests/test_demo_classifier_module.py`
These files were verified present. Slices that move backing logic also add or update tests for the affected controls before running the gate.

### Slice 0 — ADR authority bootstrap
- Branch: `docs/#NNN-ml-edge-relayout-adrs-bootstrap`
- Scope: create ADR-056 `ML frame intake and source package layout`; create ADR-057 `FrameObservation runner contracts and edge runtime package architecture`; update `docs/decisions/README.md` decision index and coverage matrix.
- ADR status: both ADRs include `Implementation status: planned; realized by Slices 1-11`. ADR-057 records the training exception: training may import `contracts`, `features`, `sources`, and `runners`; training must not import perception/domains/runtime/events/serving/demo/core/util. ADR-057 also records mutable tracking stays in perception while stateless IoU math is L0.
- Tests created: none.
- Shims introduced/removed: none/none.
- ACs advanced: AC1 documentation authority; AC2/AC3/AC4/AC5 decision coverage.
- Dependencies: none.
- Churn risk: size/S; markdown is non-logic.
- Verification: inspect README links, ADR implementation-status clauses, supersession references, and free ADR numbers 056/057.

### Slice 1 — L0 contracts, artifact helpers, and features foundation
- Branch: `feat/#NNN-ml-l0-contracts-features-artifacts`
- Scope: create `ml/contracts/{__init__.py,frame.py,observation.py,event.py,model.py,artifacts.py}` and `ml/features/{__init__.py,pose_normalization.py,window_features.py,geometry.py}`. Move canonical `Frame`, `FrameSource`, observation/event/model protocols, `normalize_person_keypoints`, `extract_window_features`, and stateless geometry primitives. Move `pose_weight_path` and `pose_weight_filename` to `contracts.artifacts` because they are pure ADR-015 model-artifact path resolution, not model execution. Add `DEFAULT_FALL_CONFIDENCE_THRESHOLD` to `contracts.model` or a serving-local constant for Slice 2.
- Greedy tracking split: only stateless `iou()` and `greedy_match()` go to `features.geometry`. Mutable `GreedyIouTracker` does not move here; it will live in `perception.tracker` in Slice 5a. `training/evaluate_nh.py` gets a training-local tracking loop on top of `features.geometry` in Slice 2.
- Tests created: no new file; update existing feature tests for artifact helper and stateless geometry behavior if needed.
- Shims introduced: `core.contract` and `util.frame_source` delegate to new contracts; legacy feature functions delegate to `features.*`; `core.model_modules.pose_weight_path/pose_weight_filename` delegate to `contracts.artifacts` until Slice 11.
- Shims removed: none.
- ACs advanced: AC1, AC2 foundation, AC5 because demo-backed primitives are touched.
- Dependencies: Slice 0.
- Churn risk: size/M; split contracts/artifacts from features only if size/L appears.
- Verification: `cd ml && uv run pytest tests/test_util_frame_source.py tests/test_training_features.py tests/test_training_windowing.py tests/test_serving_model.py`; `cd ml && uv run ruff check contracts features core util training serving tests`; demo functional gate command.

### Slice 2 — Truthful import severance and guard activation
- Branch: `test/#NNN-ml-training-serving-import-guards`
- Scope: sever `serving -> training` before enabling the guard. Repoint `ml/serving/pipeline.py`: `training.extract_poses.normalize_person_keypoints` -> `features.pose_normalization.normalize_person_keypoints`; `training.data.features.extract_window_features` -> `features.window_features.extract_window_features`; `training.config.CONF_THRESHOLD` -> `contracts.model.DEFAULT_FALL_CONFIDENCE_THRESHOLD` or a serving-local constant.
- Training import destination map completed in this slice:
  - `training/extract_poses.py`: `core.model_modules.pose_weight_path` -> `contracts.artifacts.pose_weight_path`; `core.yolo_runtime.YoloPoseRunner` -> `runners.yolo_pose.YoloPoseRunner` once Slice 4 lands. During Slice 2, keep the existing core import only behind an xfailed guard is not allowed; therefore Slice 2 creates the import target surface as a thin compatibility export only if Slice 4 is pulled forward, or Slice 2 is paired with the runner skeleton. Preferred execution: include a minimal `runners/__init__.py` and `runners/yolo_pose.py` re-export adapter in Slice 2, then Slice 4 fills the implementation. This keeps the guard true without duplication.
  - `training/propose_nh_gold.py`: `pose_weight_path` -> `contracts.artifacts.pose_weight_path`; `YoloPoseRunner` -> `runners.yolo_pose.YoloPoseRunner`.
  - `training/evaluate.py`: `pose_weight_path` -> `contracts.artifacts.pose_weight_path`; `YoloPoseRunner` -> `runners.yolo_pose.YoloPoseRunner`.
  - `training/evaluate_nh.py`: `core.contract.BoundingBox` -> `contracts.observation.BoundingBox`; `core.tracking.GreedyIouTracker` -> a training-local evaluation loop using `features.geometry.iou/greedy_match`; `core.model_modules.pose_weight_filename` -> `contracts.artifacts.pose_weight_filename`; `core.model_modules.pose_weight_path` -> `contracts.artifacts.pose_weight_path`; `core.yolo_runtime.YoloPoseRunner` -> `runners.yolo_pose.YoloPoseRunner`.
- Training dependency end state: training imports training-local plus `contracts`, `features`, `sources`, and `runners`; it imports no `perception`, `domains`, `runtime`, `events`, `serving`, `demo`, `core`, or `util`. This is the preferred DRY option and gives a single pose-execution path through `runners.yolo_pose`.
- Tests created: create `ml/tests/test_import_dependency_ladder.py` with the guards in Section 4; update training/evaluate tests if needed for the training-local tracking loop.
- Shims introduced: minimal runner re-export skeleton only if needed to make training imports real before Slice 4; ledgered as implementation-completed Slice 4, not retained as separate shim.
- Shims removed: serving direct training imports; training direct core/util imports in the enumerated files.
- ACs advanced: AC2 truthfully complete for import direction; AC5 because serving pipeline backs demo classification.
- Dependencies: Slice 1.
- Churn risk: size/M; hard gate slice and must not split guard from severance.
- Verification: `cd ml && uv run pytest tests/test_import_dependency_ladder.py tests/test_training_features.py tests/test_training_models.py tests/test_training_windowing.py tests/test_serving_model.py`; `cd ml && uv run ruff check training serving features contracts runners tests`; demo functional gate command.

### Slice 3 — L1 sources package and source registry migration
- Branch: `feat/#NNN-ml-sources-package`
- Scope: create `ml/sources/{__init__.py,video_file.py,webcam.py,rtsp.py,registry.py}`; migrate `util.frame_source` and `serving/source_registry.py`; RTSP scaffold only; demo file upload and live camera source selection continue using real source implementations.
- Demo coverage updates: update or extend `test_demo_video_registry.py` for upload widget persistence through `video_registry.persist_uploaded_video` for mp4/mov/avi/mkv; update `test_demo_live_source_selection.py` for live page camera selectbox, thumbnails, `camera_probe`, and `다시 검색`.
- ADR/doc updates: update ADR-056 status and README coverage; ADR-011 realization note.
- Tests created: no new file; update existing demo source tests.
- Shims introduced: `util.frame_source` re-exports sources; `serving.source_registry` delegates to `sources.registry`.
- Shims removed: old source implementation bodies replaced by adapters.
- ACs advanced: AC1, AC3, AC5.
- Dependencies: Slices 1 and 2.
- Churn risk: size/M.
- Verification: source tests plus `tests/test_import_dependency_ladder.py`; demo functional gate command.

### Slice 4 — L1 runners registry, device, warmup, model adapters
- Branch: `feat/#NNN-ml-runners-registry`
- Scope: complete `ml/runners/{__init__.py,registry.py,device.py,warmup.py,yolo_pose.py,yolo_bed_seg.py,sklearn_fall.py}`. `runners.yolo_pose.YoloPoseRunner` becomes the single real pose-execution code path for training, demo, and runtime. Runners import `contracts.artifacts.pose_weight_path/pose_weight_filename` from L0. Adapt `core.model_modules`, `core.yolo_runtime`, `core.bed_detector`, `core.classifiers`, and `serving.model`.
- Demo coverage updates: update `test_demo_registry_catalog.py` for classifier selectbox backed by `training.models.catalog.CATALOG`; update `test_demo_temporal_classifier.py`, `test_demo_classifier_module.py`, and `test_demo_bed_detector.py` if runner-backed model logic moved; add functional checks for YOLO pose-size selectbox and play/stop buttons where existing AppTest helpers cover them.
- ADR/doc updates: update ADR-057 for runner contracts, ModelRegistry, and training-to-runners exception realized; update README coverage.
- Tests created: create `ml/tests/test_runners_registry.py`.
- Shims introduced: old core/serving model modules import-compatible adapters.
- Shims removed: any minimal runner skeleton from Slice 2 is replaced by real implementation in the same package; no `training.pose_runtime` exists.
- ACs advanced: AC1, AC2, AC3, AC5.
- Dependencies: Slice 2 guard constraints.
- Churn risk: size/M target; split before merge if size/L appears, but first sub-PR must keep training imports resolvable and guards green.
- Verification: `cd ml && uv run pytest tests/test_runners_registry.py tests/test_serving_model.py tests/test_yolo_overlay.py tests/test_training_artifacts.py tests/test_import_dependency_ladder.py`; demo functional gate command.

### Slice 5a — Planned split: perception package and compatibility contract
- Branch: `feat/#NNN-ml-perception-frame-observation-contract`
- Scope: create `ml/perception/{__init__.py,observation_builder.py,tracker.py,window_buffer.py,scene_state.py}`; complete `FrameObservation` contract; implement mutable `perception.tracker.GreedyIouTracker` as stateful wrapper around `features.geometry.iou/greedy_match`; introduce DetectionResult compatibility shim; keep consumers mostly unchanged.
- Demo coverage updates: update `test_demo_tracking.py` for tracking behavior and `test_demo_yolo_overlay.py` for overlay rendering still reading compatible observation data.
- ADR/doc updates: ADR-057 records stateless vs mutable tracking split and FrameObservation status; README coverage.
- Tests created: create `ml/tests/test_perception_observation_builder.py` and `ml/tests/test_frame_observation_contract.py`.
- Shims introduced: `core.tracking` delegates to `perception.tracker`; DetectionResult compatibility shim.
- Shims removed: none final.
- ACs advanced: AC1, AC3, AC5.
- Dependencies: Slices 1, 2, 4.
- Churn risk: planned size/M; broad consumers wait for 5b.
- Verification: perception tests, overlay tests, `tests/test_import_dependency_ladder.py`; demo functional gate command.

### Slice 5b — Planned split: migrate consumers off DetectionResult
- Branch: `refactor/#NNN-ml-frame-observation-consumers`
- Scope: migrate demo, serving pipeline internals, runner outputs, and domain-prep consumers from DetectionResult to FrameObservation; leave only compatibility shim until Slice 11.
- Demo coverage updates: `test_demo_yolo_overlay.py` must cover all four overlay combinations: boxes on/off times pose on/off, and both off returns clean frame. Update tests for domain/role segmented-control if observation-backed UI data changed.
- ADR/doc updates: ADR-057 consumer migration status and README coverage.
- Tests created: no new file unless a coverage gap is found; update existing demo and observation tests.
- Shims introduced: none.
- Shims removed: dead DetectionResult consumer code.
- ACs advanced: AC1, AC3, AC4, AC5.
- Dependencies: Slice 5a.
- Churn risk: size/M by planned split; split by consumer group if still size/L.
- Verification: observation/perception tests, `tests/test_yolo_overlay.py`, `tests/test_import_dependency_ladder.py`; demo functional gate command.

### Slice 6 — L3 domains: fall wired, bed_exit wired, inactive scaffolds
- Branch: `feat/#NNN-ml-domains-fall-bed-exit`
- Scope: create `ml/domains/{__init__.py,base.py,fall/{__init__.py,detector.py,schema.py},bed_exit/{__init__.py,detector.py,schema.py},wheelchair_standup/,long_lie/,risk/}`; migrate fall and bed_exit logic; scaffold remaining domains disabled.
- Demo coverage updates: update `test_demo_app_controls.py` for classifier selectbox, 판정 임계값 slider via `demo.thresholds.default_threshold`, 탐지 파라미터 expander values, and domain/role segmented-control; update `test_demo_bed_exit.py` and FallEventLatch badge coverage where domain outputs moved.
- ADR/doc updates: ADR-057 domain detector status and README coverage.
- Tests created: create `ml/tests/test_domains_fall.py`, `ml/tests/test_domains_bed_exit.py`, and `ml/tests/test_domain_registry_scaffolds_disabled.py`.
- Shims introduced: `core.bed_exit` delegates to `domains.bed_exit`.
- Shims removed: old domain decision code where consumers are migrated.
- ACs advanced: AC3, AC5.
- Dependencies: Slice 5b.
- Churn risk: size/M.
- Verification: domain tests, `tests/test_import_dependency_ladder.py`; demo functional gate command.

### Slice 7 — L3 runtime services and incident manager
- Branch: `feat/#NNN-ml-runtime-camera-manager`
- Scope: create `ml/runtime/{__init__.py,edge_runtime.py,camera_worker.py,camera_manager.py,scheduler.py,status_store.py,incident_manager.py}`; implement file/webcam worker loop; multi-camera manager; idempotency/cooldown only.
- Demo coverage updates: update `test_demo_live_source_selection.py` and `test_demo_bed_exit.py` if live/runtime backing behavior changes; update `test_demo_app_controls.py` for play/stop controls if runtime controls are touched.
- ADR/doc updates: ADR-057 runtime status and README coverage.
- Tests created: create `ml/tests/test_runtime_status_store.py`, `ml/tests/test_incident_manager.py`, and `ml/tests/test_camera_manager.py`.
- Shims introduced: temporary serving/demo runtime adapters only if required, with removal recorded in shim ledger in the same PR.
- Shims removed: obsolete playback/status helpers after migration.
- ACs advanced: AC3, AC5.
- Dependencies: Slices 3, 4, 5b, 6.
- Churn risk: size/L; split status/incident from camera worker/manager if needed.
- Verification: runtime tests, `tests/test_import_dependency_ladder.py`; demo functional gate command.

### Slice 8 — L4 events package: schema, signing, outbox, publisher seam
- Branch: `feat/#NNN-ml-events-outbox-publisher`
- Scope: create `ml/events/{__init__.py,schemas.py,publisher.py,signing.py,outbox.py}`; migrate `core.alert_client`; define event payload with facility, camera, domain, open event_type, lifecycle, severity, front_event_type, evidence; implement stub/log publisher and outbox. The demo emit path must still use the real AlertClient behavior to `POST /ingest/alerts` with HMAC, no mock fallback.
- Demo coverage updates: update demo alert/FallEventLatch badge tests and any live_bench coverage if emit path changes.
- ADR/doc updates: reaffirm ADR-023; update ADR-057 event seam status; README coverage.
- Tests created: create `ml/tests/test_events_schema.py`, `ml/tests/test_events_signing.py`, and `ml/tests/test_events_outbox.py`.
- Shims introduced: `core.alert_client` delegates to events.
- Shims removed: direct alert sends from runtime/domain paths.
- ACs advanced: AC3, AC4, AC5.
- Dependencies: Slice 7.
- Churn risk: size/M.
- Verification: event tests, incident tests, `tests/test_import_dependency_ladder.py`; demo functional gate command.

### Slice 9 — L5 serving app factory, route reconciliation, and demo real-client preservation
- Branch: `feat/#NNN-ml-serving-lifespan-routes`
- Scope: split serving into app factory, `serving/lifespan.py`, routes `health.py`, `status.py`, `models.py`, `debug.py`; enforce boot order; move window prediction route to `/debug/predict/window`; expose `/health/live`, `/health/ready`, `/status`, `/models`, `/debug/predict/*`; model-load failure -> not-ready + `model.load_failed`; camera failure -> degraded + `camera.offline`.
- Mandatory `/predict` reconciliation: move `core.serving_client.ServingFallClassifier` to `serving/client.py` and update it in the same slice to call `base_url + "/debug/predict/window"`. Keep a temporary `/predict` alias only if needed, ledgered for Slice 11 removal. Update `docs/rules/streamlit-demo.md` section 8, ADR-048, and ADR-027 in the same slice. Prove the demo still classifies through the real HTTP route with a serving-client functional test and demo AppTest path; no in-process classify shortcut, no mock, no `if demo` fallback.
- Demo coverage updates: update `test_demo_temporal_classifier.py` or `test_demo_classifier_module.py` for ServingFallClassifier route; update `test_demo_app_controls.py` for real classification control path; update live_bench tests if present or add coverage in existing functional suite.
- ADR/doc updates: align ADR-029, ADR-027, ADR-048; update ADR-057 serving status and README coverage.
- Tests created: create `ml/tests/test_serving_health.py`, `ml/tests/test_serving_status.py`, `ml/tests/test_serving_models.py`, `ml/tests/test_serving_debug_predict.py`, and `ml/tests/test_serving_client_real_route.py`.
- Shims introduced: `core.serving_client` delegates to `serving.client`; optional `/predict` alias ledgered for Slice 11.
- Shims removed: remaining serving pipeline adapter not needed after routes split.
- ACs advanced: AC3, AC4, AC5.
- Dependencies: Slices 7 and 8.
- Churn risk: size/L; split routes from lifespan only if serving-client route reconciliation stays with the route-moving PR.
- Verification: serving route tests, serving-client real-route test, `tests/test_import_dependency_ladder.py`; demo functional gate command.

### Slice 10 — Edge-loop e2e and full demo functional proof
- Branch: `test/#NNN-ml-edge-loop-e2e-demo-green`
- Scope: add file-source and fake-webcam e2e for source -> runners -> perception -> domains -> incident -> outbox -> publisher stub; update demo adapters to new packages without model logic; add or update functional coverage for any controls not already covered: classifier selectbox, threshold slider, detection expander, YOLO pose-size selectbox plus play/stop, overlay toggles, domain/role segmented-control, upload widget, live camera page, FallEventLatch badge, and live_bench.
- ADR/doc updates: update ADR-057 status for AC3/AC5 e2e realized; README coverage.
- Tests created: create `ml/tests/test_edge_runtime_e2e.py`; create additional demo functional test files only if existing listed files cannot hold the coverage, otherwise update existing files.
- Shims introduced: none.
- Shims removed: demo-facing adapters no longer needed after direct migration.
- ACs advanced: AC1, AC3, AC4, AC5.
- Dependencies: Slice 9.
- Churn risk: size/M.
- Verification: `cd ml && uv run pytest tests/test_edge_runtime_e2e.py tests/test_import_dependency_ladder.py`; demo functional gate command; full `cd ml && uv run pytest` if demo changes are broad.

### Slice 11 — Final shim/core/util removal and docs/rules finalization
- Branch: `refactor/#NNN-ml-remove-core-util-shims`
- Scope: remove `ml/core/`, `ml/util/`, all `core.*`/`util.*` imports, DetectionResult compatibility shim, deprecated `/predict` alias if retained, and any temporary adapter not explicitly retained by ADR. Update `docs/rules/ml-filesystem-layout.md`, `docs/architecture.md`, `docs/rules/streamlit-demo.md`, ADR status checklists, and README coverage matrix to final realized status.
- Hard gate: flip `test_no_core_util_after_cleanup` from xfail/skip to enforced; run full pytest; run import scan; fail if shim ledger has unresolved entries; fail if demo functional gate fails.
- Tests created: update `ml/tests/test_import_dependency_ladder.py`; no new test file.
- Shims introduced: none.
- Shims removed: all ledgered shims.
- ACs advanced: AC1, AC2, AC3, AC4, AC5 final proof.
- Dependencies: Slices 0-10.
- Churn risk: size/M if previous slices migrated consumers; split only if final enforced cleanup remains in the last PR.
- Verification: `cd ml && uv run pytest`; `cd ml && uv run ruff check .`; `cd ml && uv run python -c "import contracts, features, sources, runners, perception, domains, runtime, events, serving.main"`; final import scan for no core/util; demo functional gate command.

## 3. ADR + doc writing order

1. Slice 0: ADR-056 supersedes ADR-006 and says implementation planned in Slices 1, 3, 11.
2. Slice 0: ADR-057 supersedes ADR-050 and ADR-026, says implementation planned in Slices 1, 4, 5a, 5b, 6, 7, 8, 9, 10, 11, records training-to-runners allowance, L0 artifact helpers, and stateless-vs-mutable tracking split.
3. Slice 2: ADR-022 update: training may import `contracts`, `features`, `sources`, `runners`, and training-local; training must not import `perception`, `domains`, `runtime`, `events`, `serving`, `demo`, `core`, or `util`; serving must not import training.
4. Slice 3: ADR-011 note: `sources.webcam` realizes live camera as second source and `sources.rtsp` is scaffold-only.
5. Slice 4/5a/5b: ADR-057 status updates for ModelRegistry, runner contracts, FrameObservation, perception, and DetectionResult migration.
6. Slice 8: ADR-023 reaffirmation: ML emits typed events; backend owns policy/final dedupe; ML incident manager owns idempotency/cooldown only.
7. Slice 9: ADR-029 alignment for eager lifespan/camera_manager/readiness; ADR-027 and ADR-048 alignment for `/debug/predict/window`; `docs/rules/streamlit-demo.md` section 8 updated in the same PR as `serving.client` route change.
8. Slice 11: `docs/rules/ml-filesystem-layout.md`, `docs/architecture.md`, `docs/rules/streamlit-demo.md`, ADR status checklists, README decision index, and coverage matrix finalized.
9. Every code slice: update relevant ADR implementation-status checklist plus `docs/decisions/README.md` incrementally.

## 4. Per-slice verification & guard tests

### Guard tests and activation slices
1. Slice 2 activates `test_training_imports_only_allowed_packages`: AST parse `ml/training/**/*.py`, resolving absolute, relative, and `ml.`-qualified imports. Allow stdlib, third-party, training-local, `contracts`, `features`, `sources`, and `runners`. Fail on `core`, `util`, `perception`, `domains`, `runtime`, `events`, `serving`, `demo`.
2. Slice 2 activates `test_serving_never_imports_training`: AST parse `ml/serving/**/*.py`, resolving absolute, relative, and `ml.`-qualified imports. Fail on imports resolving to `training`.
3. Slice 2 activates `test_dependency_ladder_direction`: ranks `contracts=0`, `features=0`, `sources=1`, `runners=1`, `perception=2`, `domains=3`, `runtime=3`, `events=4`, `serving=5`, `demo=5`, `training=special`. Production packages may import only lower ranks except L5 assembly; training special may import L0/L1 only. Same-rank bans: no production package imports `demo`; `domains -/-> runtime`; `runtime -/-> events`; `events -> runtime` allowed; `contracts` and `features` import nothing from the new tree.
4. Slice 9 adds or tightens `test_demo_uses_real_serving_client_route`: demo classifier path uses `serving.client.ServingFallClassifier` against `/debug/predict/window`; no in-process classifier shortcut or mock fallback.
5. Slice 11 activates `test_no_core_util_after_cleanup`: previously xfail/skip; enforced to assert no `ml/core`, no `ml/util`, and no imports from `core`, `util`, `ml.core`, or `ml.util` anywhere except historical docs.

### Unit, integration, e2e, observability
- L0: `cd ml && uv run pytest tests/test_training_features.py tests/test_training_windowing.py tests/test_util_frame_source.py tests/test_import_dependency_ladder.py`.
- L1: `cd ml && uv run pytest tests/test_util_camera_source.py tests/test_util_camera_probe.py tests/test_serving_model.py tests/test_runners_registry.py tests/test_import_dependency_ladder.py`.
- L2: `cd ml && uv run pytest tests/test_perception_observation_builder.py tests/test_frame_observation_contract.py tests/test_demo_tracking.py tests/test_demo_yolo_overlay.py tests/test_import_dependency_ladder.py`.
- L3: `cd ml && uv run pytest tests/test_domains_fall.py tests/test_domains_bed_exit.py tests/test_domain_registry_scaffolds_disabled.py tests/test_incident_manager.py tests/test_camera_manager.py tests/test_runtime_status_store.py tests/test_import_dependency_ladder.py`.
- L4: `cd ml && uv run pytest tests/test_events_schema.py tests/test_events_signing.py tests/test_events_outbox.py tests/test_import_dependency_ladder.py`.
- L5: `cd ml && uv run pytest tests/test_serving_health.py tests/test_serving_status.py tests/test_serving_models.py tests/test_serving_debug_predict.py tests/test_serving_client_real_route.py tests/test_import_dependency_ladder.py`.
- Demo functional gate: command listed in Section 2 for every demo-backing slice.
- Existing suite: `cd ml && uv run pytest` after Slices 2, 5b, 9, 10, and 11.
- Edge-loop e2e: `cd ml && uv run pytest tests/test_edge_runtime_e2e.py`.
- Readiness/ops: serving health and status_store tests assert `model.load_failed` and `camera.offline` behavior.
- Observability: status_store records timestamp, camera id, facility id, non-secret error category; publisher stub logs event id and `event/` namespace target.

### AC mapping
- AC1 layout/contracts: Slices 1,3,4,5a,5b,9,11; full pytest, ruff, final no-core/util guard.
- AC2 training decoupling: Slices 1,2,4,11; import guard plus training feature/window/model tests.
- AC3 realtime path: Slices 6,7,8,9,10; domain/runtime/event/serving health tests and edge e2e.
- AC4 API/events: Slices 8,9,10,11; event schema tests and serving route tests.
- AC5 Streamlit demo functional integrity: Slices 1-11 whenever demo-backing code changes; demo functional gate command; Slice 9 additionally runs `tests/test_serving_client_real_route.py` to prove the demo classification path uses the real route.

## 5. Pre-mortem

1. Shim becomes permanent coexistence. Early signal: a PR adds logic inside `core`/`util` adapters or the shim ledger has no removal slice. Mitigation: Slice 0 creates the ledger, every slice updates it, and Slice 11 hard-gates unresolved entries plus enforced no-core/util guard.
2. FrameObservation migration breaks DetectionResult/demo consumers. Early signal: Slice 5a compatibility tests or demo functional gate fails. Mitigation: planned 5a compatibility contract before 5b consumer migration; deletion waits for Slice 11.
3. Serving/training coupling is not actually severed. Early signal: Slice 2 guards find `serving.pipeline` importing training or training importing core/util/perception/serving. Mitigation: Slice 2 repoints serving and training imports before guard activation and cannot merge without guards passing.
4. A demo control silently breaks or demo diverges to a non-production path. Early signal: demo functional gate fails, or Slice 9 moves `/predict` without updating `ServingFallClassifier`. Mitigation: AC5 per-slice functional gate, Slice 9 same-slice route/client/docs reconciliation, and a guard/test proving the demo uses the real serving route and alert path without mock or in-process fallback.

## 6. ADR final-plan block

### Decision
Execute a hybrid foundation-then-vertical migration: L0 contracts/features/artifacts and truthful guards first, L1 sources/runners with training-to-runners pose execution, planned perception split, then domains/runtime/events/serving with demo route reconciliation, e2e proof, and final shim deletion.

### Drivers
Respect the settled ladder while allowing the narrow AC2-compatible training-to-runners pose path; keep PRs reviewable; keep tests and every Streamlit demo feature functional; remove all shims in the same cycle; preserve production-same-path demo behavior.

### Alternatives considered
Strict bottom-up horizontal was rejected because product and demo evidence arrive too late. Capability-vertical was rejected because it weakens dependency direction. Strict training L0-only with `training.pose_runtime` was rejected because it either wraps deleted core or duplicates runner logic; narrow training-to-runners is DRY and matches the binding AC2 guard.

### Why chosen
The architecture is settled but sequencing is risky. This plan makes invariants true before enforcing them, uses one pose execution path, keeps artifact path resolution in L0, splits stateful perception from pure geometry, and treats demo behavior as first-class acceptance.

### Consequences
Training has a documented narrow dependency on `runners` for offline pose execution. More demo tests run per slice. ADR-022/057 must explicitly encode this guard shape so future changes do not relitigate it.

### Follow-ups
Deferred: wheelchair_standup, long_lie, and risk implementation; RTSP live wiring; top-level `incidents/` split; `model_runtime` versus `runners` split; `src/eldercare_ml/` packaging.

## 7. Worktree & PR mechanics

- Execution runs in a separate worktree, never main: `git wt <issue#>` or `git wt <issue#> --slug <slice-slug>` for fan-out.
- One PR per slice, branch format `<type>/<issue#>-<slug>`, replacing `#NNN` with the real issue.
- Merge order: Slice 0 -> 1 -> 2 -> 3/4 -> 5a -> 5b -> 6 -> 7 -> 8 -> 9 -> 10 -> 11.
- PR body template includes `## Slice`, `## Verification`, `## Safety`, current shim ledger delta, ADR/README status delta, and AC5 demo functional gate result when demo-backing code is touched.
- Any `size/XL` PR must split before merge; `size/L` should split unless reviewer accepts risk. Slice 5 is already split.
- Main has stale ralplan/ultragoal state. Execution worktrees must start clean from fresh `origin/main`; each PR confirms clean worktree and no staged `ml/data` or `ml/models` artifacts.
