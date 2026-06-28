# 아키텍처 문서 (개발자 온보딩)

이 문서는 신규 합류 개발자가 코드를 열기 전에 전체 런타임이 어떻게 나뉘고 연결되는지 읽는 순서를 안내한다. `docs/onboarding/` 컬렉션은 wire 계약이나 ADR의 이유를 반복하지 않고, 요청·프레임·이벤트가 실제로 어떻게 흐르는지 설명한다.

## 코드 열기 전에 읽는 순서

1. [`../architecture.md`](../architecture.md) — 전체 시스템 아키텍처와 host/edge 토폴로지
2. [`./edge-device.md`](./edge-device.md) — edge device의 `ml-api` + `ml-worker` 구성
3. [`./edge-worker-streaming.md`](./edge-worker-streaming.md) — `ml-worker` 내부 RTSP→pose→domain fact 절차
4. [`./frontend.md`](./frontend.md) — frontend SSE 수신과 화면/컴포넌트 구조
5. [`./backend.md`](./backend.md) — backend 계층 책임, RLS, Event API→SSE/Kakao 흐름

## 한눈 흐름 맵

```text
[RTSP camera]
     │
     ▼
[ml-worker]
 capture → pose → window → classify → domain fact
     │  POST /api/v1/relay/{alerts,heartbeat}
     ▼
[ml-api]
 relay validation → backend Event API egress
     │  POST /api/v1/events (+ heartbeat)
     ▼
[backend]
 facility/space resolve → policy → dedup → persistence
     │
     ├──► [Postgres]
     ├──► [SSE GET /api/v1/dashboard/stream] ───► [front]
     └──► [Kakao outbox/delivery]
```

| 문서 | 한 줄 설명 |
| --- | --- |
| [`../architecture.md`](../architecture.md) | 인스턴스, 포트, env, host/edge Compose, live data path를 한 번에 잡는 overview |
| [`./edge-device.md`](./edge-device.md) | edge stack에서 `ml-worker`와 `ml-api`가 왜 분리되고 어떻게 backend로 push하는지 |
| [`./edge-worker-streaming.md`](./edge-worker-streaming.md) | 카메라 프레임이 backend 호출 직전의 relay fact가 되기까지 worker 내부 단계 |
| [`./frontend.md`](./frontend.md) | dashboard가 backend API와 SSE를 받아 화면 상태로 바꾸는 방식 |
| [`./backend.md`](./backend.md) | Event API ingress 이후 policy, RLS, persistence, SSE, Kakao side effect의 책임 분리 |

## 이 컬렉션의 범위

`docs/onboarding/`는 시스템의 흐름과 구성(how it flows)을 설명한다. 정확한 HTTP body, SSE frame, route inventory 같은 wire 계약은 [`../api/`](../api/)가 소유하고, 왜 그런 결정을 했는지는 [`../decisions/`](../decisions/)의 ADR이 소유하며, 데이터 모델과 도메인 용어는 [`../domain/`](../domain/)에서 확인한다.

## References

### Architecture documents

- [`../architecture.md`](../architecture.md) — 전체 시스템 아키텍처
- [`./edge-device.md`](./edge-device.md) — Edge device 아키텍처
- [`./edge-worker-streaming.md`](./edge-worker-streaming.md) — worker 내부 스트리밍 절차
- [`./frontend.md`](./frontend.md) — Frontend 아키텍처
- [`./backend.md`](./backend.md) — Backend 아키텍처

### Hubs

- [`../api/`](../api/) — wire/API 계약
- [`../decisions/`](../decisions/) — ADR 허브
- [`../domain/`](../domain/) — 데이터 모델/도메인 문서

### Referenced ADRs

- [ADR-029 — Per-site edge inference with signal-only egress](../decisions/ml/ADR-029-edge-inference-deployment-topology.md)
- [ADR-034 — SSE realtime transport — read-only cookie-auth push with alertSeq replay](../decisions/backend/ADR-034-sse-realtime-transport.md)
- [ADR-062 — Host/Edge Compose topology — ML on the edge, front+backend+db on one host](../decisions/common/ADR-062-host-edge-compose-topology.md)
- [ADR-067 — ML edge API and camera worker service split](../decisions/ml/ADR-067-ml-edge-api-worker-service-split.md)
