# ML 엣지 디바이스 재정렬 — 결정 메모 · 폴더 트리 · 의미 · ADR 정리

> 출처: 2026-06-20 deep-interview. 최종 모호도 ~15% (early-exit). 전체 spec: `/tmp/deep-interview-ml-edge-device-relayout.md`.
> 이 노트는 *왜(의미)* 와 폴더 *책임*, 그리고 *어떤 ADR가 충돌하고 무엇을 바꿔야 하는지* 를 담는다.
> ⚠ deep-interview는 ADR/문서를 **수정하지 않는다**(경계상 mutation 불가). 아래는 execution(워크트리)이 집행할 캡처다.

## 한 줄 요약
`ml/`은 **엣지 디바이스 런타임**: 영상 입력 → 모델 추론 → 백엔드 전송. 핵심 = **"공유 모델 runner → 공통 perception → 도메인 detector → event publisher"**. 모델은 공유 관측(observation)을 만들고 도메인은 관측을 해석한다. 모델 교체(YOLO→RTMPose→ONNX→VLM)에도 도메인/런타임/이벤트 불변, `runners/`+`models/`+`configs/`만 변경.

## 핵심 원칙
1. 모델을 도메인에 넣지 않는다 — `runners/`가 실행, `domains/`가 해석.
2. 도메인은 model output이 아니라 observation을 본다(여러 도메인이 공유 소비).
3. 모델 교체 = runner+artifact+config만. 고정 인터페이스: `PoseRunner.predict(frame)->PoseObservation`, `BedRunner.predict(frame)->BedObservation`, `FallWindowRunner.predict(window)->ModelScore`.
4. MECE 기준 = "이 파일이 바뀌는 이유가 무엇인가?".
5. POC는 과하지 않게 — 9-패키지 flat, 트리거 충족 시 분리.

## 폴더 트리 (end-state)
```
ml/
  configs/        edge.example.yaml, edge.local.yaml
  models/         아티팩트만(코드 X): pose/ bed/ person/ fall/

  contracts/      frame.py, observation.py, event.py(+enums), model.py
  features/       pose_normalization.py, window_features.py, geometry.py   ← 순수 커널(최하층)
  sources/        video_file.py, webcam.py, rtsp.py(스캐폴드), registry.py
  runners/        registry.py, device.py, warmup.py, yolo_pose.py, yolo_bed_seg.py, sklearn_fall.py
  perception/     observation_builder.py, tracker.py, window_buffer.py, scene_state.py
  domains/        base.py, fall/{detector,schema}✅, bed_exit/{detector,schema}✅,
                  wheelchair_standup/⊘, long_lie/⊘, risk/⊘
  runtime/        edge_runtime.py, camera_worker.py, camera_manager.py, scheduler.py,
                  status_store.py, incident_manager.py
  events/         schemas.py, publisher.py, signing.py, outbox.py
  serving/        main.py(app factory), lifespan.py(부팅 순서 강제), routes/{health,status,models,debug}.py

  training/       오프라인 only (→ features만)
  demo/           Streamlit local UI (overlay 렌더 포함, 모델 로직 X) — 동작 유지
  tests/
```
사라지는 것: `ml/core/`, `ml/util/`, 모든 shim.

## 폴더별 의미 (책임 / 바뀌는 이유 / 금지 / 출처)
| 폴더 | 책임 | 바뀌는 이유 | 금지 | 출처 |
|------|------|------------|------|------|
| contracts/ | Frame/Observation/Event/Model 타입·Protocol + event_type/severity/front DetectionEventType 매핑 | 공유 계약 변경 | YOLO/FastAPI/cv2 구현 | core/contract, core/events |
| features/ | 순수 수학 변환(pose 정규화·window feature). 최하층 leaf | 피처 정의 변경 | 모델 load/API/loop/cv2 | training/extract_poses, training/data/features |
| sources/ | webcam/video/RTSP 입력 + resolver | 입력 매체 변경 | 도메인 판단/전송 | util/frame_source, serving/source_registry |
| runners/ | 모델 실행 어댑터 + registry/device/warmup | **모델 기술 변경** | 정책/전송 | core/model_modules, yolo_runtime, bed_detector, classifiers |
| perception/ | 모델 output→공통 관측 정규화(track window/scene) | 정규화 방식 변경 | Kakao/DB/route | core/tracking, core/features(런타임 조립) |
| domains/ | fall/bed_exit 제품 판단 rule | 판단 규칙 변경 | raw 모델 호출 | core/bed_exit, serving/pipeline 판정부 |
| runtime/ | camera worker/manager, scheduler, buffer, status, incident(dedupe/cooldown/idempotency) | 루프·스케줄·중복억제 변경 | route 정의/정책 | 신규(현 demo/live_view 일부) |
| events/ | alert/camera/heartbeat 생성·서명(HMAC)·outbox·전송(대상 추상, event/ 네임스페이스) | **백엔드 이벤트 계약 변경** | 모델 추론 | core/alert_client |
| serving/ | FastAPI app, lifespan(부팅), health/status/debug | 엔드포인트 변경 | business rule 구현 | serving/main 분해 |
| training/ | 학습·평가·artifact (오프라인) | 학습 변경 | serving/perception import | training/* |
| models/ | weight·metadata·manifest | 모델 버전 변경 | Python code | models/* (ADR-015 유지) |
| demo/ | Streamlit UI, overlay 렌더 | 데모 UI 변경 | 모델/rule 로직 | demo/* (동작 유지) |

## 의존 사다리
```
L0 contracts/ features/          ← 모두가 의존
L1 sources/ runners/             → L0
L2 perception/                   → L1,L0
L3 domains/ runtime/             → L2,L0
L4 events/                       → L3,L0
L5 serving/                      → 전부 조립
training/ → L0만 (perception·serving 미참조)  ·  serving ↛ training  (가드 테스트)
demo/ → L0~L4 어댑터(모델 로직 X)
```

## 추론 흐름
sources → runtime(frame buffer) → runners(pose/bed) → perception(observation) → domains(detector) → events(publish) → backend.

## 부팅 순서 (serving/lifespan.py 강제)
```
1 config 로드·검증 (실패→부팅 중단)
2 device 선택
3 runners.registry + 전 모델 eager warmup (실패→readiness NOT ready + ops model.load_failed)
4 런타임 서비스: status_store · incident_manager · events.outbox + publisher seam
5 sources 구성
6 camera_manager → 카메라별 camera_worker (소스 실패→camera.offline; 워커 재시도, 부팅 비중단)
7 readiness=READY (모델 로드 성공 시에만; 카메라 degraded 허용)
shutdown(역순): worker 정지 → outbox flush → 모델 해제
```
규칙: 모델 실패=NOT ready(하드) · 카메라 실패=degraded(소프트) · config 실패=부팅 중단.

## 이벤트 모델 (2축 + 식별)
- severity(작고 고정 ~3) = front `Level`{LOW/MEDIUM/HIGH}(+emergency).
- event_type(개방형 레지스트리) = fall.detected/bed_exit.detected/… 새 탐지 = 여기만 추가.
- 방출 = {facility, camera, domain, event_type, lifecycle, severity, front_event_type, evidence}. (요양원=다중 카메라 → facility+camera 필수.)
- 도메인 용어는 front SSoT(`front/src/types/index.ts`)에서 통일.

## ADR Reconciliation (execution이 집행, deep-interview는 캡처만)
| ADR / 문서 | 현 내용 | 상태 | execution 조치 |
|---|---|---|---|
| **ADR-006** frame-source intake in `ml/util/` | 인테이크 = `ml/util/frame_source.py` | **충돌·supersede** | util/ 해체 → 인테이크는 `sources/`, `Frame`/`FrameSource` 계약은 `contracts/frame.py`. ADR-006이 YAGNI로 미뤘던 "두 번째 소비자(serving)·top-level 패키지"가 이제 정당화됨 → 새 ADR로 대체 |
| **ADR-050** frame/model contract (supersedes ADR-026 용어) | `FrameSource`+`ModelModule.predict(frame)->DetectionResult`, 공개 심볼 불변, **레지스트리 나중** | **충돌·supersede** | 새 ADR: `FrameModel.predict_frame->FrameObservation` + `WindowModel.predict_window->ModelScore`, `DetectionResult`→`FrameObservation`(detections/poses/regions) 재설계, **ModelRegistry 도입(now)**, 도메인은 observation 소비(raw 모델 X) |
| **ADR-026** seam architecture | 두-seam 설계(ADR-050이 용어 승계) | 충돌·역사기록 | ADR-050 후속 새 ADR가 아키텍처까지 supersede(026은 역사 기록 유지) |
| **docs/rules/ml-filesystem-layout.md** | "Frame-intake contract code → ml/util/ (ADR-006)" | **충돌·갱신** | 새 트리로 표/규칙 갱신. models/data 행(ADR-015/012)은 유지 |
| **docs/architecture.md** | ml/ 레이아웃(core/ 등) | **충돌·갱신** | 새 트리·의존 사다리·부팅 순서로 갱신 |
| **ADR-022** serving/training lifecycle | 서빙/학습 경계 | 보강 | `training→features만`·`serving↛training` 가드 명문화 |
| **ADR-029** edge inference deployment topology | 엣지 배포 토폴로지 | 정렬·리뷰 | eager-lifespan+camera_manager+readiness/ops 반영 |
| **ADR-027** inference output baseline policy | 추론 출력 기준 | 리뷰 | FrameObservation 재설계와 정합 확인 |
| **ADR-011** live camera as 2nd FrameSource | 라이브 카메라 소스 | 보완 | `sources/webcam·rtsp`가 실현 |
| **ADR-023** ML/backend boundary | ML=typed 이벤트, 정책=backend | **유지·재확인** | `events/`+`incident_manager`(idempotency only) 준수 |
| **ADR-015** models single root | models/=아티팩트만 | **유지·재확인** | 그대로 |
| pending plan `2026-06-18-ml-camera-event-pipeline` (+spec) | core/ 통합 | **대체** | 이 spec/트리가 superseded |

## 실행 방식
- **별도 워크트리**(다른 효현이 ultragoal/ralplan 상태 점유; worktree-workflow.md). main 직접 금지.
- 점진+shim, Streamlit·테스트 무중단, **이번 사이클 전 슬라이스 완료·shim 제거**. 슬라이스별 검증.
- 다음 단계 = **ralplan**(슬라이스 경계/순서/ADR 작성 순서 확정) → pending approval → execution.
