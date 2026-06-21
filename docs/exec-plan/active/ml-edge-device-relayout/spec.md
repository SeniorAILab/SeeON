# Deep Interview Spec: ml/ 엣지 디바이스 재정렬 (모델/도메인 분리 · contracts/runners/perception/domains · 점진+shim)

## Metadata
- Interview ID: ml-edge-relayout-2026-06-20
- Rounds: R0 topology + R1–R7 scored + R8 트리/부팅 + R9 구조 우조정 + Restate(loop 2)
- Final Ambiguity Score: ~15% (0.148)
- Type: brownfield
- Generated: 2026-06-20
- Threshold: 0.05
- Threshold Source: default
- Initial Context Summarized: no (사용자가 상세 아키텍처 제안 제공)
- Status: BELOW_THRESHOLD_EARLY_EXIT (5% 임계값은 멀티-컴포넌트 + 실측/환경 의존[RTSP·멀티카메라 동시성]으로 도달 불가; 진짜 결정은 전부 해소)
- Auto-Researched Rounds: none
- Auto-Answered Rounds: none
- Architect Failures: 0
- Lateral Reviews: 2 (R1 initial→progress, R4 progress→refined; inline researcher/contrarian/simplifier/architect)
- Lateral Panel Failures: 0
- Refined Rounds: R1, R4, R7, R9
- Closure Overrides: 1 (restate loop1 — training→perception 의존 역전 분쟁 재점화)
- Restated Goal: 아래 ## Goal
- 환경 비고: 스테일 active ralplan(2026-06-18 revision)이 bash를, 스테일 active ultragoal(G001)이 ask를 게이트 → 인터뷰는 산문으로 진행, 실행은 별도 워크트리에서 클린 상태로.

## Clarity Breakdown (컴포넌트별 최소값 게이팅)
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.86 | 0.35 | 0.301 |
| Constraint Clarity | 0.86 | 0.25 | 0.215 |
| Success Criteria | 0.84 | 0.25 | 0.210 |
| Context Clarity | 0.84 | 0.15 | 0.126 |
| **Total Clarity** | | | **0.852** |
| **Ambiguity** | | | **0.148** |

수렴 경로(비단조): 100 → 38 → 33 → 31 → 29.5 → 22 → 19.6 → **26 ▲(의존 분쟁)** → 19.6 → ~15%.

## Topology (Round 0 확정: 4 active, 0 deferred)
| Component | Status | Description | Coverage / Note |
|-----------|--------|-------------|------------------|
| layout-reorg+contracts | active | core/util 해체 → contracts/features/sources/runners/perception로 분해, serving 분할, 점진+shim 무중단·이번 완료 | AC 1 |
| training-decoupling | active | 윈도우/포즈 피처를 top-level features/로 호이스트, serving·training이 features만 의존(상호 미참조) | AC 2 |
| realtime-product-path | active | fall·bed_exit 기능 wired, 나머지 스캐폴드, eager-lifespan→file/webcam→runtime→runners→perception→domains→incident→outbox→publisher seam | AC 3 |
| api-surface (축소) | active | edge 로컬 FastAPI + events/ publisher seam(event/ 네임스페이스, facility+camera 포함). **백엔드 인입 API 구현은 보류(백엔드 대규모 리팩토링에 위임)** | AC 4 |

## Established Facts
- EF0 (R0): 토폴로지 4 active, 0 deferred. 전제 수용: 이 트리가 pending plan `2026-06-18-ml-camera-event-pipeline`(core/ 통합)을 대체; incidents=edge idempotency·정책은 backend(ADR-023); Streamlit 무중단.
- EF1 (R1): 백엔드 제품 이벤트 인입 API 설계·구현 = 이번 사이클 제외(백엔드 대규모 리팩토링에서 정렬). ML publisher = 추상·플러그블 seam.
- EF2 (R1): 식별 계층 = facility ⊃ space(방) ⊃ camera(방당 1개) → facility=다중 방=다중 카메라. front `Space.cameraId`와 정합.
- EF3 (R1): 공통 이벤트 네임스페이스 = `event/` (> `ingest`). 모델별 API 금지·공통 payload 원칙 유지.
- EF4 (R1): 도메인 엔티티/이벤트 어휘는 front SSoT(`front/src/types/index.ts`)에서 통일. ML 독자 정의 금지.
- EF5 (R2): 기동 = eager lifespan warmup + readiness 게이트. 카메라 worker config대로 자동 시작(공개 /start 없음). 실패 표면화: 모델 로드 실패→/health/ready=not ready + ops `model.load_failed`; 소스 실패→`camera.offline`. 탐지 0건=정상.
- EF6 (R3): contract 마이그레이션 = 점진+shim. 신 `contracts/` 먼저, 구 `core.contract`는 어댑터 shim. 소비자 슬라이스별 이전 후 shim 제거. ADR 신규(util 해체·contracts 승격) + ml-filesystem-layout.md/architecture.md 갱신 포함.
- EF7 (R4): 이벤트 어휘 = 내부 dotted+lifecycle 풍부 유지 + `contracts`에 front `DetectionEventType` 1급 매핑. 방출 이벤트 = {domain, event_type(open), lifecycle, front_event_type, severity}.
- EF8 (R4): 이벤트 2축 = (a) severity 작고 고정(~3, front `Level`) (b) event_type 개방형 레지스트리. 새 탐지 추가 = 새 event_type 등록만, severity enum·API 모양·publisher seam 불변.
- EF9 (R4 보강): 마이그레이션 완료 기준 = 이번 사이클 전 슬라이스 완료, 슬라이스별 검증, shim 제거. 영구 공존 금지.
- EF10 (R5): 실시간 범위 = fall(RF)·bed_exit(BedDetector+BedExitMonitor) 기능 wired; wheelchair_standup/long_lie/risk = DomainDetector 프로토콜+registry 스캐폴드(모델 없음→비활성). 소스 = file/webcam, RTSP는 클래스만(라이브 follow-on).
- EF11 (R6→R7, 수정): training-decoupling = 순수 피처 커널(`extract_window_features`, `normalize_person_keypoints`)을 **top-level `features/`** 로 호이스트(R7 분쟁 해소: perception 아님). 의존: serving·training·perception·domains → features(단방향). training ↛ perception/serving, serving ↛ training. 가드 테스트 강제.
- EF12 (R9): 모델/도메인 분리 = 핵심. `runners/`=모델 실행(공유), `domains/`=observation 해석. 모델 교체 = runner+artifact+config만, domain/runtime/events 불변. 고정 인터페이스: `PoseRunner.predict(frame)->PoseObservation`, `BedRunner.predict(frame)->BedObservation`, `FallWindowRunner.predict(window)->ModelScore`. 도메인은 Observation만(구체 모델 클래스 모름).
- EF13 (R9): MECE 기준 = "이 파일이 바뀌는 이유". 모델기술→runners/models, 관측정규화→perception, 제품판단→domains, 카메라루프→runtime, 백엔드계약→events, FastAPI→serving, 순수수학→features.
- EF14 (R9): 이벤트 스키마는 `facility` + `camera` 식별 포함(요양원 다중 카메라).
- EF15 (R9): 우조숙 분리 보류 — top-level `incidents/`는 안 만듦(→ `runtime/incident_manager.py`); `model_runtime/`+`model_runners/`는 `runners/`로 통합. 분리 트리거: 이벤트 lifecycle(NEW→ACKED→RESOLVED)+dedupe/idempotency/cooldown/severity가 다도메인 공통 / runner>10·device 스케줄링 복잡.
- EF16 (R9): 실행은 별도 워크트리(다른 효현이 ultragoal/ralplan 상태 점유; worktree-workflow.md 하드룰).
- EF17 (R8): 부팅 실행 순서 고정(아래 ## Boot Order).

## Trigger Metadata
- R1 D(scope, specified): 백엔드 경계 명확화 + 식별계층/용어 SSoT 도입 → 수렴(100→38).
- R7 B(internal inconsistency): "training(오프라인)→perception(런타임)" 의존 역전 분쟁 → C2 constraints 0.84→0.60, 모호도 19.6→26% ▲(비단조). EF10/EF11 disputed→해소(features/ 호이스트). contradicted fact 보존(삭제 아님).
- R9 (revision, converging): 트리 우조정(축소·재배치)은 명세화된 수렴 — 모호도 ▼. 미해결·disputed 잔여 트리거 없음.

## Lateral Review Panel
- R1 (initial→progress, inline): architect — eager-lifespan+readiness+ops가 always-on edge 정석. researcher — RTSP 연구됨이나 현 런타임 file+webcam. → R2 질문에 접음.
- R4 (progress→refined, inline): researcher — fall/pose/bed 모델만 존재, wheelchair/long_lie/risk 모델 없음. contrarian/simplifier — 모델 없는 도메인 스캐폴드만; RTSP 라이브 불필요. architect — DomainDetector+registry+source registry가 확장 seam. → R5 질문에 접음.

## Goal
`ml/`를 엣지 디바이스 런타임으로 재정렬한다: `core`/`util`을 해체해 **`contracts/`**(Frame/Observation/Event/Model 계약 + front `DetectionEventType` 매핑)·**`features/`**(순수 피처 커널: pose_normalization/window_features/geometry)·**`sources/`**(video/webcam/rtsp)·**`runners/`**(공유 모델 어댑터+registry/device/warmup)·**`perception/`**(observation_builder/tracker/window_buffer/scene_state)·**`domains/`**(fall·bed_exit 기능 + wheelchair_standup/long_lie/risk 스캐폴드)·**`runtime/`**(camera_worker/manager/scheduler/status_store/incident_manager)·**`events/`**(schemas/publisher/signing/outbox)·**`serving/`**(FastAPI app/lifespan/routes)로 분해하고; 점진+shim으로 Streamlit·테스트 무중단하며 **이번 사이클에 전 슬라이스 완료(shim 제거)**; 순수 커널을 `features/`로 호이스트해 serving·training이 features만 의존(상호 미참조, 가드 테스트); **모델은 공유 observation을 만들고 도메인은 observation을 해석**해 모델 교체 시 `runners/`+`models/`+`configs/`만 바뀌고 도메인/런타임/이벤트는 불변; fall·bed_exit를 기능 wired해 eager-lifespan 로딩+readiness 게이트+ops 실패 표면화로 file/webcam → runtime → runners → perception → domains → incident(idempotency) → outbox → publisher seam 실시간 루프를 돌리고; 방출 이벤트는 개방형 `event_type` + 고정 ~3단계 severity(front `Level`) + `facility`/`camera` 식별로 확장 용이; 백엔드 인입 API 구현은 백엔드 대규모 리팩토링에 위임하고 도메인 용어는 front SSoT에서 통일한다. 실행은 별도 워크트리에서, 슬라이스 경계/순서는 ralplan이 확정.

## Adopted Folder Tree (POC: flat ml/; src/eldercare_ml/는 장기 옵션)
```
ml/
  configs/        edge.example.yaml, edge.local.yaml
  models/         아티팩트만(코드 X): pose/ bed/ person/ fall/

  contracts/      frame.py, observation.py, event.py(+enums: event_type/severity/DetectionEventType 매핑), model.py
  features/       pose_normalization.py, window_features.py, geometry.py     ← 순수 커널(최하층 leaf)
  sources/        video_file.py, webcam.py, rtsp.py(스캐폴드), registry.py
  runners/        registry.py, device.py, warmup.py, yolo_pose.py, yolo_bed_seg.py, sklearn_fall.py
  perception/     observation_builder.py, tracker.py, window_buffer.py, scene_state.py
  domains/        base.py, fall/{detector,schema}✅, bed_exit/{detector,schema}✅,
                  wheelchair_standup/{detector,schema}⊘, long_lie/⊘, risk/⊘
  runtime/        edge_runtime.py, camera_worker.py, camera_manager.py, scheduler.py,
                  status_store.py, incident_manager.py(dedupe/cooldown/idempotency)
  events/         schemas.py, publisher.py(event/ 타깃·대상 추상), signing.py(HMAC), outbox.py
  serving/        main.py(app factory), lifespan.py(부팅 순서 강제), routes/{health,status,models,debug}.py

  training/       오프라인 only (→ features만; perception·serving 미참조)
  demo/           Streamlit local UI (overlay 렌더 포함, 모델 로직 X) — 기존 동작 유지
  tests/
```
사라지는 것: `ml/core/`, `ml/util/`, 모든 마이그레이션 shim.
의존 사다리: features ← (모두) / contracts ← (모두) / sources·runners → contracts·features / perception → runners·contracts·features / domains·runtime → perception·contracts / events → runtime·contracts / serving → 전부 조립. training → features·contracts만. demo → 어댑터.

## Boot Order (serving/lifespan.py 강제)
```
부팅 → app factory → lifespan enter:
 1. config 로드·검증            (실패 → 부팅 중단)
 2. device 선택 (cpu/cuda/mps)
 3. runners.registry + 전 모델 eager 로드·warmup  (실패 → readiness=NOT ready + ops model.load_failed; 서버는 뜸)
 4. 런타임 서비스 초기화: status_store · incident_manager · events.outbox + publisher seam
 5. sources 구성 (카메라별 file/webcam/rtsp resolve)
 6. camera_manager 기동 → 카메라별 camera_worker (scheduler→runners→perception→domains→incident→outbox)
                                (소스 실패 → camera.offline ops; 워커 재시도, 부팅 비중단)
 7. readiness = READY           (모델 로드 성공 시에만; 카메라 degraded 허용)
shutdown(역순): camera_worker 정지 → outbox flush → 모델 해제
```
3대 규칙: 모델 실패=NOT ready(하드) · 카메라 실패=degraded(소프트) · config 실패=부팅 중단.

## Internal Flow
```
sources → runtime(camera_worker가 최신 frame buffer) → runners(pose/bed) → perception(PersonObservation/PoseTrack/BedRegion/SceneState)
  → domains(fall/bed_exit detector) → events(alert/camera/heartbeat 생성·서명·outbox) → backend(추상 대상)
```
핵심: runners(모델은 관측을 만든다) → perception(정규화) → domains(관측을 해석). runtime=언제 실행할지. events=밖으로. serving=부팅·상태노출.

## Constraints
- ML/backend 경계(ADR-023): ML은 typed 이벤트 방출; severity/채널/정책/최종 dedup은 backend. ML `incident_manager`는 idempotency·cooldown까지(정책 아님).
- 모델/도메인 분리 + 고정 runner 인터페이스(observation 경유). 도메인은 구체 모델 클래스 미인지.
- 순수 커널 = `features/`(top-level). serving·training·perception·domains → features 단방향. training ↛ perception/serving, serving ↛ training (가드 테스트).
- 점진+shim 마이그레이션, Streamlit·테스트 무중단, **이번 사이클 전 슬라이스 완료·shim 제거**.
- 이벤트 = 개방형 event_type + 고정 severity(front `Level`) + lifecycle + front_event_type + facility/camera 식별.
- 백엔드 인입 API 구현 보류(백엔드 리팩토링 위임); publisher 대상은 추상·플러그블, event/ 네임스페이스 지향.
- 도메인 용어는 front SSoT(`front/src/types/index.ts`)에서 통일.
- 실행은 별도 워크트리 + PR 슬라이스(worktree-workflow.md, PR-size 하드룰). main 직접 금지.
- `models/`=아티팩트만(ADR-015), `ml/data/`=도메인 우선(ADR-012) 유지. 사용자 대면 한국어.

## Non-Goals
- 백엔드 Prisma/DTO/라우팅/인입 엔드포인트 구현(백엔드 리팩토링으로).
- ML 독자 도메인 용어 정의.
- top-level `incidents/` 분리, `model_runtime/`÷`model_runners/` 분리(트리거 충족 전).
- wheelchair_standup/long_lie/risk 기능 구현(스캐폴드만), RTSP 라이브 연결(클래스만).
- pose+bed 단일 멀티태스크 모델, `src/eldercare_ml/` 패키지화(장기 옵션).

## Acceptance Criteria
### AC1 layout-reorg+contracts
- [ ] `contracts/`·`features/`·`sources/`·`runners/`·`perception/`·`domains/`·`runtime/`·`events/` 생성, `serving/` app factory+lifespan+routes 분할.
- [ ] `core/contract` → 신 contracts shim(어댑터), 소비자 슬라이스별 이전 후 **shim·`core/`·`util/` 제거(이번 사이클 완료)**.
- [ ] Streamlit demo + 기존 테스트가 전 슬라이스에서 그린 유지.
- [ ] ADR 신규(util 해체·contracts 승격, ADR-006 갱신) + ml-filesystem-layout.md/architecture.md 갱신.
### AC2 training-decoupling
- [ ] `extract_window_features`→`features/window_features.py`, `normalize_person_keypoints`→`features/pose_normalization.py` 이동(정본).
- [ ] 가드 테스트: serving→training import 0, training→perception/serving import 0, 모두 features 하향 의존.
- [ ] training 테스트 그린 유지.
### AC3 realtime-product-path
- [ ] eager-lifespan 부팅 순서(위) 구현, `/health/ready` 게이트 + ops `model.load_failed`/`camera.offline`.
- [ ] runners→perception→domains 흐름, fall·bed_exit 기능 wired(기존 RF·BedExitMonitor 재배선); 나머지 도메인 스캐폴드(비활성).
- [ ] file/webcam 소스로 edge 루프 e2e → incident(idempotency) → outbox → publisher seam(추상 대상) 동작 입증.
- [ ] 멀티카메라: camera_manager가 복수 camera_worker 구동(방당 1 카메라).
### AC4 api-surface
- [ ] edge 로컬 FastAPI routes: `/health/(live|ready)`, `/status`, `/models`, `/debug/predict/*`. 기존 `/predict`→`/debug/predict/window`.
- [ ] events 스키마 = {facility, camera, domain, event_type(open), lifecycle, severity(Level), front_event_type, evidence}.
- [ ] publisher 대상 추상(event/ 네임스페이스 지향), 백엔드 미구현 시 stub/로그로 seam 입증.

## Deferrals
- 슬라이스 경계/순서 → ralplan 확정.
- 순수 커널 정확 모듈명, config 로더 위치 → ralplan/execution.
- top-level incidents/ 분리, model_runtime÷runners 분리, RTSP 라이브, wheelchair/long_lie/risk 기능, src/ 패키지화 → 후속(트리거 명시).
- Convergence Pacing: min-round floor/score-drop cap/dampening 미도입; bidirectional scoring이 pacing 기제.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "제품 API를 ML이 정의/구현" | API는 백엔드 인입 계약, 곧 대규모 리팩토링 | 백엔드 API 보류, ML은 publisher seam만, event/ 네임스페이스 |
| "용어를 ML이 새로 정함" | front가 SSoT 선언 | front 어휘 통일(facility/space/zone/camera/resident/staff, DetectionEventType) |
| "lazy load면 충분" | always-on edge | eager lifespan + readiness 게이트 + ops 실패 |
| "DetectionResult 그대로" | observation 재설계 필요 | FrameObservation으로 점진+shim, 이번 완료 |
| "training→perception 의존 OK" | 오프라인이 런타임 의존(역전 냄새) | 순수 커널을 top-level features/로 호이스트 |
| "12-패키지 트리 한 번에" | POC 단위 과함 | 우조정: runners 통합, incidents 보류, events 통합, 9-패키지 flat |
| "모델별/도메인별 폴더" | 모델 공유·교체 불가 | 모델/도메인 분리, observation 경유, 모델 교체=runner/artifact/config |

## Technical Context
- 현 serving: `ml/serving/{main.py /predict,/health · model.py FallDetector(RF) · pipeline.py FallPipeline(runtime에서 training.config/extract_poses/data.features import) · source_registry.py}`.
- 현 core(해체 대상): contract(ModelModule/DetectionResult/BoundingBox), model_modules(YoloPoseModule), yolo_runtime, bed_detector(one-shot), bed_exit(BedExitMonitor), tracking, events, features, classifiers/classifier_module, temporal_module, alert_client(HMAC), thresholds, serving_client, playback_status.
- 현 util(해체 대상): frame_source(Frame/FrameSource/VideoFileSource/CameraSource), camera_probe.
- front SSoT(`front/src/types/index.ts`): Facility/Floor/Space(cameraId 1:1)/Zone(BED|AREA)/Resident/STAFF; DetectionEventType{...,BED_EXIT,...}, Level{LOW/MEDIUM/HIGH}, KakaoAlertStatus. 정책: 사용자엔 실시간 스트림 비노출(클립) → 실시간은 edge 내부.
- 가용 모델: `models/fall/`(RF), `models/pose/`(YOLO pose), `models/bed/`(YOLO seg/det). wheelchair/long_lie/risk 없음. RTSP 연구: `docs/research/s1-cctv-stream-access.md`.
- 관련 ADR: 006(util 계약, 갱신 대상), 012(data), 015(models 단일루트), 022/023(경계), 025(per-frame 1패스).
- 대체되는 사전 산출물: pending plan `2026-06-18-ml-camera-event-pipeline`(core/ 통합) 및 그 spec.

## Ontology (Key Entities, 최종)
| Entity | Type | Note |
|--------|------|------|
| Frame / FrameSource | contract | sources/ 구현; util→sources |
| FrameObservation / Detection / Pose / Region | contract | perception이 생성; DetectionResult 재설계 |
| FrameModel/WindowModel (PoseRunner/BedRunner/FallWindowRunner) | contract | runners/ 구현, observation 출력 |
| 순수 피처 커널(window_features/pose_normalization/geometry) | features | 최하층 leaf, serving·training 공유 |
| ModelRegistry | runners | task→runner, config 기반 |
| DomainDetector(fall/bed_exit/...) | domains | observation 해석 |
| IncidentManager | runtime | dedupe/cooldown/idempotency |
| EventPublisher / Outbox / Signing | events | event/ 타깃, 대상 추상 |
| event_type(open) / severity(front Level) / front_event_type | contract | 2축 + 매핑 |
| Facility/Space/Camera/Zone/Resident/Staff | contract(front SSoT) | 식별·용어 통일 |
| EdgeRuntime/CameraManager/CameraWorker/Scheduler | runtime | 멀티카메라 루프 |

## Interview Transcript (요약)
- R0 topology: 4 active. R1 백엔드 보류+식별계층+event/+front SSoT(refined). R2 eager lifespan+readiness. R3 점진+shim. R4 dotted+lifecycle+front 매핑+2축(refined). R5 fall+bed_exit 기능·나머지 스캐폴드·file/webcam. R6 training→features. R7 의존역전 분쟁→features/ 호이스트(▲후 해소, refined). R8 트리+부팅순서. R9 구조 우조정(runners 통합·incidents 보류·events·features 호이스트)+모델/도메인 분리+facility/camera+별도 워크트리. Restate 확인.
