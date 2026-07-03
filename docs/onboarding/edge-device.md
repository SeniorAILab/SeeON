# Edge device 아키텍처

이 문서는 현장 엣지 디바이스에서 `ml-api`와 `ml-worker`가 어떻게 나뉘고 연결되는지 설명한다. 신규 합류자가 카메라 입력부터 backend Event API egress까지의 프로세스 경계, 배포 토폴로지, 상태 소유권을 먼저 파악할 때 읽는다.

## 핵심 흐름

```text
현장 Edge device
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  RTSP cameras                                                       │
│      │                                                              │
│      ▼                                                              │
│  ┌──────────────┐     HTTP relay + X-Edge-Relay-Token               │
│  │ ml-worker    │ ─────────────────────────────────────┐            │
│  │              │                                      ▼            │
│  │ capture      │                         ┌──────────────────────┐  │
│  │ pose/person  │                         │ ml-api               │  │
│  │ bed runners  │                         │                      │  │
│  │ perception   │                         │ /api/v1/relay/*      │  │
│  │ domains      │                         │ health/status/models │  │
│  │ heartbeat    │                         │ debug/source registry│  │
│  └──────────────┘                         │ heartbeat store      │  │
│                                           └──────────┬───────────┘  │
│                                                      │              │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │ HTTPS
                                                       ▼
                                      backend `POST /api/v1/events`
                                      backend `POST /api/v1/events/heartbeat`
```

라이브 경로는 `RTSP → ml-worker → ml-api /api/v1/relay/* → backend /api/v1/events`이다. `ml-worker`는 backend를 직접 호출하지 않고, `ml-api`가 엣지 디바이스의 유일한 backend-facing 프로세스다.

## 왜 두 프로세스인가

ADR은 카메라 루프의 수명과 FastAPI 게이트웨이의 수명을 분리한다. RTSP 스트림이 끊기거나 특정 카메라 추론이 느려져도 `ml-api`의 health/readiness/debug/status 표면은 독립적으로 살아 있어야 하고, backend Event API URL·공개 egress·relay token 검증은 한 프로세스에 모여야 한다.

| 프로세스 | 책임 | 실제 코드 |
| --- | --- | --- |
| `ml-worker` | RTSP capture, pose/person/bed runner 실행, `FrameObservation` 조립, fall/bed-exit domain fact 생성, heartbeat 생성, local relay 호출 | `ml/worker/edge_worker.py`, `ml/worker/camera_worker.py`, `ml/worker/edge_worker_supervisor.py`, `ml/worker/edge_worker_config.py` |
| `ml-api` | `/api/v1/relay/*` 수신, `X-Edge-Relay-Token` 검증, `API_CAMERA_INVENTORY` 기반 camera binding, backend Event API egress, health/status/models/debug route, source registry, heartbeat store, lifespan readiness | `ml/api/main.py`, `ml/api/lifespan.py`, `ml/api/routes/ingest_relay.py`, `ml/api/routes/health.py`, `ml/api/routes/status.py`, `ml/api/routes/models.py`, `ml/api/routes/debug.py` |
| backend | Event API ingress 이후 정책, dedup, 불변 Event 저장, Alert 파생, SSE/Kakao side effect | `backend/src/events/events.controller.ts`, `../domain/alert-pipeline.md`, `../rules/rest-api-convention.md` |

## 프로세스 경계와 연결

### `ml-worker → ml-api`

`ml-worker`는 `EdgeWorkerConfig` YAML을 읽고 `_RelayClient`를 만든다. `EdgeWorkerConfig.relay_alert_url`과 `relay_heartbeat_url`은 base `relay.url`에 각각 `/api/v1/relay/alerts`, `/api/v1/relay/heartbeat`를 붙인다.

`compose.edge.yaml`에서는 다음 연결을 고정한다.

| 항목 | 값/동작 | 근거 |
| --- | --- | --- |
| worker relay base | `RELAY_URL=http://ml-api:8000` | `compose.edge.yaml` `ml-worker.environment` |
| relay token | `RELAY_TOKEN`이 worker YAML/환경으로 들어가고 `API_EDGE_RELAY_TOKEN`과 같은 값이어야 함 | `.env.edge.prod.example`, `compose.edge.yaml` |
| relay auth header | `X-Edge-Relay-Token` | `ml/worker/edge_worker.py`, `ml/api/routes/ingest_relay.py` |
| alert relay | `POST /api/v1/relay/alerts` → `202` accepted | `ml/api/routes/ingest_relay.py` |
| heartbeat relay | `POST /api/v1/relay/heartbeat` → `202` accepted | `ml/api/routes/ingest_relay.py` |

`ml-api`는 relay 요청에서 token을 먼저 검증하고, `API_CAMERA_INVENTORY`로 구성된 `camera_inventory`에서 `camera_id`와 `facility_id`가 일치하는지 확인한 뒤 backend egress를 수행한다. heartbeat는 auth와 camera binding 이후, backend egress 이전에 `HeartbeatStore.record()`로 local `received_at`을 찍기 때문에 `/api/v1/status`는 backend 장애와 독립적인 edge-local liveness를 보여준다.

### `ml-api → backend`

`ml/api/lifespan.py`는 `API_BACKEND_EVENTS_URL`이 있으면 `EdgeIngestClient`를 구성한다. relay alert는 backend `POST /api/v1/events`로, relay heartbeat는 `EdgeIngestClient.send_heartbeat()`의 URL join을 통해 `POST /api/v1/events/heartbeat`로 전달된다.

`ml-api`는 이 경로에서 HMAC을 만들지 않는다. backend는 `camera_id`를 기준으로 facility/space 소유권과 정책을 해석하며, ML은 alert/heartbeat fact만 올린다.

## Edge Compose 토폴로지

`compose.edge.yaml`은 외부 엣지 디바이스에서만 실행되는 두 컨테이너 스택이다.

| 구성 | 설명 |
| --- | --- |
| `ml-api` publish | 컨테이너는 `0.0.0.0:8000`에 bind하지만 host publish는 `127.0.0.1:${ML_SERVING_PORT:-8000}:8000`로 loopback-only다. |
| `ml-api` env | `API_BACKEND_EVENTS_URL`, `API_EDGE_RELAY_TOKEN`, `API_CAMERA_INVENTORY`를 필수로 받는다. |
| `ml-api` model mount | `${ML_MODELS_DIR:-./ml/models}:/app/models:ro`를 읽기 전용으로 mount한다. |
| `ml-api` healthcheck | `GET http://127.0.0.1:8000/health/live`를 호출한다. |
| `ml-worker` config | `EDGE_CAMERA_CONFIG=/run/secrets/ml-worker.yaml`; Compose secret `ml-worker-config`가 `${EDGE_CAMERA_CONFIG}` 파일을 mount한다. |
| `ml-worker` dependency | `depends_on.ml-api.condition: service_healthy`; gateway가 live 된 뒤 worker가 뜬다. |
| `ml-worker` command | `python -m worker.edge_worker --config /run/secrets/ml-worker.yaml --heartbeat-on-start` |

`.env.edge.prod.example`은 `API_CAMERA_INVENTORY=[{"camera_id":"cam-edge-01","facility_id":"facility-prod"}]` 형식을 예시로 둔다. 이 inventory는 relay payload의 camera/facility binding 검증에 쓰이며, RTSP URL과 domain/model 설정은 gitignored worker YAML에 둔다.

## 3-state 모델

ADR 기준으로 엣지 상태는 세 종류로 나뉜다. 핵심은 `ml-api`와 `ml-worker` 사이에 공유 mutable runtime state가 없다는 점이다.

| 상태 종류 | Owner | 흐름 | 현재 구현/방향 |
| --- | --- | --- | --- |
| Policy CONFIG | backend가 SSOT, edge는 immutable snapshot/last-known-good copy | 향후 backend → `ml-api` pull → worker pull | night window, domain enable/disable 같은 값은 중앙 소유가 목표다. 현재 night window는 worker YAML에 남아 있고 동적 배포는 후속 작업이다. |
| Events / facts | `ml-worker` 생성, `ml-api` egress | `worker → ml-api /api/v1/relay/* → backend /api/v1/events` | fall, bed-exit, heartbeat fact. `ml-worker`는 backend를 직접 호출하지 않는다. |
| Runtime / flow state | process-local | 공유 없음 | worker의 detection window, `IncidentManager`, `LatestFrameBuffer`, `StatusStore`; api의 `HeartbeatStore`는 relay heartbeat에서 재구성한 별도 view다. |

last-known-good 자율성은 backend/config 배포가 일시 장애여도 edge가 기존 snapshot으로 계속 판단하는 운영 모델을 뜻한다. 이 문서의 현재 live path에서는 event/fact 업로드만 구현되어 있으며, policy config pull은 ADR의 후속 방향이다.

## `ml-api` lifespan 부트 순서

`ml/api/lifespan.py`의 실제 순서는 다음과 같다.

1. `_load_config(app)`: 테스트나 app state에 주입된 config loader/validator가 있으면 실행한다.
2. device/model registry 준비: `select_device`로 `app.state.device`를 정하고 `DEFAULT_REGISTRY`를 `app.state.model_registry`로 둔다.
3. heartbeat store 준비: `HeartbeatStore(stale_after_sec=...)`가 없으면 만든다.
4. model warmup: `get_model()`로 fall model을 로드하고 `warmup_runner()`를 실행한다. 실패하면 `model_load_error`를 남기고 readiness는 not ready가 된다.
5. debug pipeline 준비: model이 있으면 `FallPipeline(model)`을 `app.state.fall_pipeline`로 둔다.
6. backend-ingest gateway 구성: `API_EDGE_RELAY_TOKEN`, `API_CAMERA_INVENTORY`, `API_BACKEND_EVENTS_URL`, timeout을 읽어 `EdgeIngestClient`를 만든다.
7. bounded debug source registry: `get_source_registry()`로 `app.state.source_registry`를 준비한다.
8. readiness 설정: model이 있으면 `{"ready": true, "status": "ready"}`, 아니면 `model.load_failed`로 not ready.

이 boot는 camera loop를 만들지 않는다. `ml-api`는 `worker` package를 import하지 않고, production RTSP/runtime state도 소유하지 않는다.

## Route surface

`ml/api/main.py`는 unversioned health probe router를 먼저 등록하고, product relay/status route는 `api_v1_prefix` 기본값 `/api/v1` 아래에 등록한다.

| Route | Owner | 용도 |
| --- | --- | --- |
| `GET /health/live` | `ml/api/routes/health.py` | 프로세스 live probe |
| `GET /health/ready` | `ml/api/routes/health.py` | lifespan readiness probe |
| `GET /health` | `ml/api/routes/health.py` | legacy health |
| `GET /api/v1/status` | `ml/api/routes/status.py` | relay heartbeat 기반 camera liveness snapshot |
| `GET /api/v1/models` | `ml/api/routes/models.py` | gateway metadata only; no model registry/device |
| `POST /api/v1/relay/alerts` | `ml/api/routes/ingest_relay.py` | worker alert fact relay, `202` |
| `POST /api/v1/relay/heartbeat` | `ml/api/routes/ingest_relay.py` | worker heartbeat relay, `202` |

와이어 계약의 필드와 응답 형식은 `ml/api/routes/*`, backend controller/DTO code, generated OpenAPI(`/api/docs`), contract tests, `../rules/rest-api-convention.md`, and `../domain/alert-pipeline.md`를 기준으로 본다. 이 문서는 흐름과 책임만 요약한다.

## References

- [../architecture.md](../architecture.md)
- [./edge-worker-streaming.md](./edge-worker-streaming.md)
- [../rules/rest-api-convention.md](../rules/rest-api-convention.md)
- [../rules/dto-convention.md](../rules/dto-convention.md)
- [../domain/alert-pipeline.md](../domain/alert-pipeline.md)
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
