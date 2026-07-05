# Edge worker streaming 절차

이 문서는 `ml-worker` 내부에서 RTSP 프레임이 어떻게 capture, runner, perception, domain fact로 변환되는지 설명한다. 범위는 `ml-api` relay 호출 직전까지이며, relay 이후 backend egress는 `./edge-device.md`에서 다룬다.

## 핵심 흐름

```text
RTSP camera
   │
   ▼
`sources.rtsp.RTSPSource` / OpenCV
   │  `contracts.frame.Frame(index, time_sec, image)`
   ▼
┌────────────────────────────────────────────────────────────────┐
│ `worker.edge_worker_supervisor.EdgeWorkerSupervisor`            │
│                                                                │
│ capture thread → `LatestFrameBuffer` → per-camera process loop  │
└────────────────────────────────────────────────────────────────┘
   │
   ▼
[ capture → scheduler → pose/person/bed runners → observation → fall window classifier → domain detectors → incident gate → fact ]
                                                                                                      │
                                                                                                      ▼
                                                                                          relay client boundary
```

마지막 `relay client boundary`에서 `worker.edge_worker._RelayClient`가 `ml-api`의 `/api/v1/relay/alerts` 또는 `/api/v1/relay/heartbeat`를 호출한다. 이 문서는 그 직전까지의 worker 내부 스트리밍 절차만 설명하고, relay token 검증·backend Event API egress·`ml-api` status는 `./edge-device.md`로 넘긴다.

## per-camera 루프 전체 절차

| 단계 | 입력 → 출력 | 책임 코드 |
| --- | --- | --- |
| source intake | RTSP URL → `Frame` iterator | `ml/worker/sources/rtsp.py`, `ml/contracts/frame.py` |
| capture buffering | `Frame` → latest frame buffer | `ml/worker/edge_worker_supervisor.py`, `ml/worker/latest_frame.py` |
| frame cadence | frame index → 실행할 runner task 목록 | `ml/worker/scheduler.py` |
| runner execution | image → pose/person/bed runner outputs | `ml/worker/camera_worker.py`, `ml/worker/runners/registry.py`, `ml/worker/runners/yolo_pose.py`, `ml/worker/runners/yolo_person.py`, `ml/worker/runners/yolo_bed_seg.py` |
| observation assembly | runner outputs → `FrameObservation` | `ml/worker/camera_worker.py`, `ml/worker/perception/observation_builder.py`, `ml/contracts/observation.py` |
| fall window classification | pose windows → fall probability/label | `ml/worker/fall_window_classifier.py`, `ml/features/pose_normalization.py`, `ml/features/window_features.py` |
| domain interpretation | `FrameObservation` → fall/bed-exit event payload | `ml/worker/domains/fall/detector.py`, `ml/worker/domains/bed_exit/detector.py` |
| incident gate | event payload → admitted fact or suppressed duplicate | `ml/worker/incident_manager.py` |
| relay boundary | admitted fact → `_RelayClient.emit()` 호출 | `ml/worker/edge_worker.py` |

`CameraWorker.process_frame()`가 이 흐름의 중심이다. `_run_scheduled_runners()`로 due runner만 실행하고, `_build_observation()`으로 `FrameObservation`을 만든 뒤, 선택적으로 `FallWindowClassifier.classify()`를 적용하고, domain detector들의 `update()` 결과를 `IncidentManager.admit()`으로 통과시킨 다음 event sink에 emit한다.

## 레이어 사다리와 worker orchestration

ADR과 `ml/AGENTS.md`의 dependency ladder는 worker가 어느 package를 어떤 방향으로 조립하는지 정한다.

| Layer | Package | worker에서의 역할 |
| --- | --- | --- |
| L0 | `contracts`, `features` | `Frame`, `FrameSource`, `FrameObservation`, runner/event protocol, pose normalization/window feature 같은 순수 계약·수학 |
| L1 | `sources`, `runners` | `RTSPSource`로 프레임을 읽고 `ModelRegistry`에서 pose/person/bed/fall runner를 만든다. |
| L2 | `perception` | runner outputs를 `FrameObservation`으로 조립하고, `GreedyIouTracker`로 사람 track/window를 유지한다. |
| L3 | `domains` | fall rising-edge와 bed-exit domain rule을 `FrameObservation` 위에서 해석한다. |
| L4 | `events` | backend Event API payload schema/client가 있지만 live worker는 backend에 직접 가지 않고 local relay sink를 쓴다. |
| worker | `worker` | deployable process. camera config, shared runner bundle, supervisor, latest-frame/status/incident/window state를 소유한다. |

하위 layer는 상위 layer를 import하지 않는다. `worker`는 deployable orchestration package라서 L0~L4를 조립할 수 있지만, `api`, `demo`, `training`은 import하지 않는다.

## source intake와 capture thread

`edge_worker._worker()`는 각 `CameraRuntimeConfig`마다 추론용 SUB 스트림(`camera.inference_rtsp_url` — `streams.sub`가 있으면 그것, 없으면 legacy 단일 `rtsp_url` fallback)으로 `RTSPSource`를 만든다. `streams.main`(1080p 증거 스트림)은 Phase-1에선 config로만 plumbing되고 디코드하지 않는다. `RTSPSource.__iter__()`는 주입 가능한 decode backend(기본 `OpenCVRTSPBackend`, BGR→RGB 변환은 backend가 담당해 RGB frame을 반환)로 capture를 열고, 선택적 `fps`로 결정적 처리율을 페이싱하며, read 실패 시 capped backoff로 재접속(supervisor `stop_event`로 취소 가능)하고 `Frame(index, time_sec, image)`를 yield한다.

`EdgeWorkerSupervisor.from_workers()`는 camera마다 `_CameraLoop(worker, LatestFrameBuffer())`를 만든다. `run()`은 다음 구조로 움직인다.

1. `_start_capture_threads()`가 camera별 daemon thread를 띄운다.
2. 각 `_capture_loop()`는 source iterator에서 frame을 읽어 `LatestFrameBuffer.put()`에 넣는다.
3. main loop는 `LatestFrameBuffer.take(timeout_sec=0.01)`로 최신 frame을 가져와 `worker.process_frame(frame)`을 호출한다.
4. `heartbeat_interval_sec`이 지나면 camera별 heartbeat sink의 `send_heartbeat()`를 호출한다.
5. 종료 시 `stop_event`를 set하고 capture thread를 join한다.

`LatestFrameBuffer`는 `queue.Queue(maxsize=1)`이다. 새 frame을 넣을 때 queue가 차 있으면 이전 frame을 버리고 최신 frame만 남긴다. 느린 추론이 RTSP capture를 무한 backlog로 밀어 넣지 않게 하는 구조다.

## runner cadence와 observation 조립

`Scheduler`는 frame index와 task interval로 실행할 runner를 고른다. `edge_worker._worker()`는 기본적으로 다음 cadence를 넣는다.

| Task | Interval |
| --- | --- |
| `pose` | `camera.frame_stride` |
| `person` | `camera.frame_stride` |
| `bed` | `max(30, camera.frame_stride)` |

`CameraWorker._run_scheduled_runners()`는 due task별 runner를 찾아 `_run_runner()`로 실행한다. `_run_runner()`는 runner 객체에서 `predict_full`, `detect_beds`, `predict`, `run` 순서로 사용 가능한 메서드를 찾고, 없으면 callable 자체를 호출한다.

`CameraWorker._build_observation()`은 runner output을 다음 규칙으로 정규화한다.

- pose output이 `DetectionResult`이면 detections로 사용한다.
- pose output이 `(poses, raw_boxes)` pair이면 pose와 raw person box로 분리한다.
- person output이 `DetectionResult`이면 detections를 덮어쓴다.
- bed output은 `BoundingBox` tuple로 변환해 `bed_boxes`에 둔다.
- 최종 assembly는 `perception.observation_builder.build_frame_observation()`가 수행한다.

`FrameObservation`은 downstream 공통 계약이다. boxes/labels는 `detections`, COCO-17 keypoints는 `poses`, bed boxes/status는 `regions`에 담긴다.

## windowing과 worker-local flow state

| 파일 | 역할 |
| --- | --- |
| `ml/worker/fall_window_classifier.py` | `GreedyIouTracker`로 person track id를 유지하고, track별 `deque(maxlen=model.metadata.window)`에 normalized keypoints를 누적한다. `model.metadata.stride`마다 feature 또는 sequence tensor를 만들어 fall model `predict()`를 호출하고, probability가 `operating_threshold` 이상이면 `FALL` label을 붙인다. |
| `ml/worker/incident_manager.py` | event의 `camera_id`, `domain`, `event_type`, `identity` 또는 bucket 기반 key를 만들고 `cooldown_sec` 안의 중복 emit을 막는다. severity, policy, routing은 하지 않는다. |
| `ml/worker/latest_frame.py` | capture thread와 process loop 사이의 maxsize-1 최신 프레임 버퍼다. backlog 대신 최신 프레임을 유지한다. |
| `ml/worker/scheduler.py` | deterministic per-frame task scheduler. frame index가 interval로 나누어떨어지는 task만 due로 반환한다. |
| `ml/worker/status_store.py` | worker 내부 camera status와 ops event를 저장한다. source failure는 camera `DEGRADED`와 `camera.offline` ops event로, frame processing failure는 `frame.processing_error`로 기록한다. |

이 상태들은 모두 worker process-local이다. `ml-api`의 `/api/v1/status`는 이 `StatusStore`를 읽지 않고, relay heartbeat에서 별도 `HeartbeatStore` view를 재구성한다.

## domain fact 생성

### Fall

`FallWindowClassifier`가 `FrameObservation.labels`에 `FALL` 또는 `NORMAL` label과 confidence를 붙인다. `domains.fall.detector.FallEventLatch.update()`는 observation에 `is_fall` label이 있는지 보고 rising edge일 때만 event payload를 만든다.

생성되는 주요 field는 다음과 같다.

| Field | 값 |
| --- | --- |
| `domain` | `fall` |
| `event_type` | `fall` |
| `identity` | event count |
| `probability` | fall label confidence |
| `time_sec` | frame time |

### Bed-exit

`domains.bed_exit.detector.BedExitMonitor`는 bed boxes와 person boxes를 `GreedyIouTracker` track에 맞춰 sticky own-bed assignment를 유지한다. person이 own bed containment를 grace frame보다 오래 벗어나면 `bed-exit` event를 만든다. `NightWindow`가 설정되어 있으면 해당 시간창 밖에서는 event를 반환하지 않는다.

생성되는 주요 field는 다음과 같다.

| Field | 값 |
| --- | --- |
| `domain` | `bed_exit` |
| `event_type` | `bed-exit` |
| `identity` | `person_id:bed_id` |
| `person_id`, `bed_id` | tracker/assignment 결과 |
| `probability` | `1.0` |
| `time_sec` | frame time |

## entrypoint, supervisor, config

| 파일 | 책임 |
| --- | --- |
| `ml/worker/edge_worker.py` | CLI parsing, config load, shared `_RunnerBundle` 구성, `_RelayClient` 구성, `CameraWorker` 생성, supervisor 실행. `--check-config`, `--heartbeat-on-start`, `--max-frames-per-camera` 옵션을 처리한다. |
| `ml/worker/edge_worker_supervisor.py` | multi-camera capture/process loop, `LatestFrameBuffer`, heartbeat cadence, graceful stop을 소유한다. |
| `ml/worker/camera_worker.py` | per-frame runner/perception/domain/incident/sink path를 소유한다. |
| `ml/worker/edge_worker_config.py` | YAML runtime contract를 검증한다. `CameraRuntimeConfig`, `RelayConfig`, `WorkerRuntimeConfig`, `FallModelConfig`, domain config, duplicate camera id 검증을 포함한다. |

worker YAML은 JSON이 아니라 YAML이어야 하며, `rtsp_url`(또는 `streams.sub`/`streams.main`)은 `rtsp://`로 시작해야 한다. `streams.sub`는 추론 입력, `streams.main`은 추후 증거용(Phase-1 미사용), 단일 `rtsp_url`은 하위호환 fallback이고, 선택적 `fps`는 결정적 처리율(기본값은 CPU 유효 추론 fps 근사)을 정하며, 선택적 `decode_backend`는 디코드 백엔드(기본 `opencv`)를 고른다. legacy backend ingest field(`ingest`, `alert_api_url`, `heartbeat_api_url`, camera-level ingest key/secret)는 config validation에서 거부된다. worker는 relay-only이며 backend Event API URL을 직접 소유하지 않는다.

## relay 직전 경계

`CameraWorker._emit()`은 event sink에 `emit(event)` 또는 `publish(event)`가 있으면 호출한다. production worker에서 event sink는 `_RelayClient`다.

`_RelayClient.emit()`은 worker 내부 event payload를 relay alert payload로 바꾼다.

| 입력 event | relay payload 변환 |
| --- | --- |
| `event_type` `fall`/`bed-exit`만 통과 | 그 외 event type은 무시 |
| `probability` 또는 `confidence` | 0.0~1.0으로 clamp |
| `detected_at` | event 값이 없으면 UTC timestamp 생성 |
| camera identity | worker config의 `camera_id`, `facility_id` 사용 |
| evidence | 원본 event dict 전체를 `evidence`에 포함 |

여기서 `_RelayClient`가 `/api/v1/relay/alerts`로 HTTP POST를 시작하면 worker 내부 streaming 문서의 범위는 끝난다. token 검증, `API_CAMERA_INVENTORY` binding, backend `POST /api/v1/events`/`POST /api/v1/events/heartbeat` 호출은 `./edge-device.md`의 `ml-api` 책임이다.

## References

- [../architecture.md](../architecture.md)
- [./edge-device.md](./edge-device.md)
- [../rules/rest-api-convention.md](../rules/rest-api-convention.md)
- [../domain/alert-pipeline.md](../domain/alert-pipeline.md)
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
