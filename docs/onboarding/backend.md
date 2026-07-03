# Backend 아키텍처

이 문서는 NestJS backend가 요청을 받아 인증·테넌시·도메인 정책·영속화·실시간/외부 전달로 이어지는 방식을 설명한다. 신규 합류자가 `backend/src/**`를 열기 전에 계층 경계, 규칙, backend↔edge 연결을 먼저 잡는 용도다.

## 한눈에 보는 책임

Backend는 `backend/src/app.module.ts`에 등록된 NestJS 모듈 묶음이며, PostgreSQL/Prisma 위에서 auth/session, RLS 멀티테넌시, Event API ingress, alert 정책, SSE, Kakao delivery outbox를 소유한다. `backend/src/main.ts`는 전역 prefix를 `api`로 두고 URI versioning 기본값을 `v1`로 켜며, auth/session/OAuth도 `/api/v1/auth/*` product API convention에 둔다.

```text
Browser dashboard
  └─ /api/v1/* product API   → AuthController / guards / domain controller-service-repository

Edge device
  └─ POST /api/v1/events, /api/v1/events/heartbeat
                              → EventsController → EventAlarmService/EventRecorderService
                              → Event SSOT + Alert 파생 + SSE + outbox/Kakao
```

## 우리의 backend 규칙

| 축 | 규칙 | 근거 |
| --- | --- | --- |
| REST namespace | product API는 `/api/v1/*`만 사용하고, session/OAuth는 `/api/v1/auth/*`, ML Event API ingress는 `/api/v1/events`와 `/api/v1/events/heartbeat`만 사용한다. dotted path나 legacy machine-ingest/HMAC route를 되살리지 않는다. | `backend/src/main.ts`, `backend/src/events/events.controller.ts`, `docs/rules/rest-api-convention.md`, ADR |
| DTO boundary | `@Body()` 요청 타입은 `*RequestDto` 등 역할 suffix가 있는 DTO여야 하며, DTO는 owning domain의 `dto/*.dto.ts`에 둔다. 외부 edge 입력은 `snake_case`, backend service/repository 내부는 mapper/parser 이후 `camelCase`를 쓴다. | `backend/src/events/dto/event.dto.ts`, `docs/rules/dto-convention.md`, ADR |
| Layering guard | controller→service→repository→ports/adapters/presenter 경계를 따른다. ESLint는 controller↛repository/Prisma/adapter, repository↛HTTP/service/controller 등을 warn-first로 드러내고, hard gate는 `scripts/backend-guard/`가 소유한다. | `docs/rules/backend-layering.md`, `docs/rules/backend-architecture-lint-and-guard.md`, ADR |
| Prisma naming | TypeScript/Prisma Client 필드는 `camelCase`, DB column/table은 `snake_case`를 `@map`/`@@map`으로 연결한다. 응답 DTO도 dashboard/frontend 계약에 맞춰 `camelCase`로 낸다. | `backend/prisma/schema.prisma`, `docs/rules/rest-api-convention.md`, ADR |
| RLS default-deny | tenant table 접근은 `PrismaService.withFacilityContext(facilityId, fn)` 안에서만 한다. 이 메서드가 transaction-local `app.facility_id` GUC를 설정하고, `$allOperations` guard가 bound context 없는 tenant model 접근을 차단한다. | `backend/src/prisma/prisma.service.ts`, `backend/src/common/tenant-context.ts`, ADR |

## Local dev DB workflow

Backend local development uses real PostgreSQL. The root commands absorb the DB
dependency instead of pretending the NestJS process is dependency-free:

| Command | Contract |
| --- | --- |
| `pnpm dev:backend` | Verify `.env.local`, start local PostgreSQL, generate Prisma Client, run `prisma migrate dev`, then start backend `start:dev`. This does not reset the DB. |
| `pnpm dev:local` | Destructive full-local loop: verify local DB URLs, start PostgreSQL, run guarded local reset/replay/seed, then start backend and front native dev servers. |
| `pnpm dev:local:reset` | Explicit alias for the same destructive full-local reset loop. |
| `pnpm db:reset:local` | Guarded local-only Prisma reset/generate/seed, without starting app servers. |
| `pnpm smoke:backend:no-db` | Provider-overridden route wiring smoke. This is not E2E and does not prove DB-backed behavior. |

Do not put `migrate`, `db push`, reset, or seed in NestJS lifecycle hooks.
`backend/package.json` keeps `start:dev` as raw Nest watch mode so root
orchestration can call it without recursion. Existing Prisma migration folders
remain committed history; local reset replays them and does not squash them.

## Layered 아키텍처

```text
HTTP request
  → JwtAuthGuard / RequireFacilityGuard / RolesGuard capability checks
  → FacilityContextInterceptor
  → Controller     (HTTP boundary, DTO parse, response mapping)
  → Service        (use-case orchestration, policy, state transition)
  → Repository     (Prisma query/write, transaction, persistence facts)
  → PrismaService.withFacilityContext(...)
  → PostgreSQL RLS (app.facility_id)
  → Presenter/DTO  (camelCase response, BigInt/Date serialization)
```

| 계층 | 책임 | 코드 예시 |
| --- | --- | --- |
| Controller | route/method/guard/interceptor/header/status, `@Param`/`@Query`/`@Body`/`@Req` 읽기, DTO boundary 통과, service 1개 use-case 호출, response mapper/presenter 호출. business policy나 Prisma 접근을 소유하지 않는다. | `backend/src/spaces/controllers/spaces.controller.ts`, `backend/src/alerts/alerts.controller.ts`, `backend/src/events/events.controller.ts` |
| DTO/parser | 외부 JSON shape, required field, timestamp/number/bigint coercion, `snake_case`↔`camelCase` 경계를 소유한다. | `backend/src/events/dto/event.dto.ts`, `backend/src/alerts/dto/alert-events.dto.ts`, `backend/src/spaces/dto/space.dto.ts` |
| Service | use-case orchestration, auth 이후 domain state 기반 검증, dedup/idempotency, alert policy, state transition, repository/adapters sequencing을 소유한다. | `backend/src/events/event-alarm.service.ts`, `backend/src/events/event-recorder.service.ts`, `backend/src/alerts/alert-writer.service.ts`, `backend/src/spaces/services/spaces.service.ts` |
| Repository | Prisma query/update/create/upsert, persistence transaction, DB uniqueness race 처리를 소유한다. HTTP exception/transport/SSE/Kakao 정책은 소유하지 않는다. | `backend/src/spaces/repositories/spaces.repository.ts`, `backend/src/alerts/repositories/alert-events.repository.ts` |
| Ports/adapters | 외부 시스템 호출과 failure translation을 소유한다. service는 concrete adapter가 아니라 port/token에 의존한다. | `backend/src/alerts/ports/channel.port.ts`, `backend/src/alerts/adapters/kakao-send-to-me-channel.adapter.ts` |
| Presenter/mapper | entity/domain result를 REST/SSE response로 바꾸고, `BigInt`/`Date`를 JSON-safe 값으로 직렬화한다. | `backend/src/dashboard/sse.controller.ts`의 `formatAlertEvent`, `formatAlertUpdateEvent`, `formatSseEvent`; `backend/src/spaces/services/spaces.service.ts`의 `presentSpace` |

`backend/src/spaces/`는 현재 계층 구조를 보기 좋은 예시다. `controllers/spaces.controller.ts`가 guard/interceptor와 HTTP parameter만 다루고, `services/spaces.service.ts`가 validation/use-case와 presenter를 맡으며, `repositories/spaces.repository.ts`가 `PrismaService.withFacilityContext`를 통해 DB 접근을 캡슐화한다.

## Module-per-domain 맵

`backend/src/app.module.ts` 기준으로 runtime module은 domain별로 묶인다.

| Module | 주 책임 |
| --- | --- |
| `AuthModule` | Kakao/email auth, JWT `app_session` cookie, `/api/v1/auth/*`, sessionVersion revocation |
| `ResidentsModule`, `ResidentAssignmentsModule` | resident profile and placement |
| `GuardiansModule` | guardian domain |
| `FacilitiesModule`, `FloorsModule`, `SpacesModule`, `ZonesModule`, `CamerasModule` | facility topology와 camera ownership/placement |
| `EventsModule` | edge Event API ingress와 Event SSOT 기록 |
| `AlertsModule` | alert policy, alert persistence, two-frame SSE emit source, retained alert-event/outbox/Kakao ports |
| `DashboardModule` | dashboard SSE read-side stream |
| `PrismaModule` | Prisma client lifecycle, RLS GUC binding, tenant access guard |

`backend/src/main.ts`의 `app.setGlobalPrefix('api', { exclude: ['/'] })`와 URI versioning 때문에 `@Controller({ path: 'alerts', version: '1' })`는 `/api/v1/alerts`가 되고, `AuthController`의 `auth/*` route도 `/api/v1/auth/*`로 노출된다. `/auth/*` compatibility alias는 유지하지 않는다.

## 요청이 계층을 통과하는 방식

인증된 product route는 `JwtAuthGuard`와, tenant scope가 필요한 경우 `RequireFacilityGuard`를 통과한다. `JwtAuthGuard`는 httpOnly `app_session` JWT를 검증하고 `req.user`에 `{ sub, role, facilityId, sessionVersion }` 기반 identity를 채운다. Admin mutation route는 추가로 `RolesGuard`와 `@RequireCapability('facilityAdmin')`를 붙인다.

그 다음 `FacilityContextInterceptor`가 request identity로 facility context를 잡고 controller가 `requireFacilityId(req)`로 `facilityId`를 service에 넘긴다. 실제 tenant table 접근은 service/repository가 `PrismaService.withFacilityContext(facilityId, tx => ...)`를 호출할 때에만 허용된다. `withFacilityContext`는 interactive transaction을 열고 `SELECT set_config('app.facility_id', facilityId, true)`를 실행해 transaction-local GUC를 묶는다. `TenantContext.runBound()`로 표시된 scope가 없으면 `PrismaService.db`의 `$allOperations` guard가 `Resident`, `Camera`, `Alert`, `Event`, `Floor`, `Space`, `Zone` 등 tenant model 접근을 `MissingTenantContextError`로 막는다.

응답은 Prisma model을 그대로 contract로 삼지 않고 presenter/DTO에서 `camelCase`로 골라 낸다. 예를 들어 `AlertsService`는 `alertSeq`를 string으로, `SpacesService.presentSpace()`는 `createdAt`을 ISO string으로 변환한다. `app.module.ts`에는 SSE/alert read API의 `BigInt` JSON serialization을 위한 `BigInt.prototype.toJSON` shim도 있다.

## Backend ↔ Edge 연결

Edge stack에서는 `ml-worker`가 camera loop를 돌며 domain fact를 만들고, `ml-api`가 backend로 push하는 유일한 edge process다. Backend가 live로 받는 ingress는 `POST /api/v1/events`와 `POST /api/v1/events/heartbeat`뿐이다. 이 경로에는 HMAC camera credential이 없고, 클라이언트가 facility를 제공해도 믿지 않는다. Backend는 `camera_id`를 기준으로 DB 함수 `get_camera_for_event_ingest(cameraId)`를 호출하는 `CamerasService.resolveForEventIngest()`에서 canonical `camera.id`, `facilityId`, `spaceId`만 해석한다. `backend/src/cameras/cameras-event-resolver.spec.ts`는 알려진 camera가 좁은 facility/space identity로만 해석되고 secret/label 등 ingest에 필요 없는 필드를 반환하지 않으며, 직접 camera model 접근은 facility context 없이 막히는 것을 검증한다.

```text
RTSP camera
  → ml-worker (capture → pose/window → classify → domain fact)
  → ml-api relay
  → POST /api/v1/events or /api/v1/events/heartbeat
  → EventsController
      ├─ heartbeat: camera_id → CamerasService.resolveForEventIngest
      │             → CamerasService.recordHeartbeat(facilityId, camera.id)
      └─ alert fact: parse camera_id/type/detected_at/confidence
             → EventAlarmService.record
             → EventRecorderService.record
                 ├─ resolve camera_id → facilityId/spaceId
                 ├─ dedupKey = sha256(cameraId|detectedAt.toISOString()|type)
                 └─ Event create in withFacilityContext (immutable Event SSOT)
             → AlertPolicyService.evaluateIngress
             → AlertWriterService.writeAlert
                ├─ Alert create
                ├─ commit-ordered SSE `event: alert`
                └─ AlertEventsService.ensureOutboxForIngest → DeliveryAttempt outbox → Kakao channel adapter
  → dashboard GET /api/v1/dashboard/stream receives `alert` / `alert-updated` frames
```

`EventRecorderService.buildEventDedupKey()`는 `cameraId.trim()|detectedAt.toISOString()|type.trim().toLowerCase()`를 SHA-256으로 해시한다. 새 Event insert가 `(facility_id, dedup_key)` unique conflict를 만나면 기존 Event를 같은 facility context에서 찾아 `{ duplicate: true }`로 반환하고, 새 Event일 때만 immutable Event SSOT row가 만들어진다.

`EventAlarmService`는 기록된 Event를 `AlertPolicyService.evaluateIngress()`에 넘긴다. 현재 ingress 정책은 ML event type을 trim/lowercase 정규화한 뒤 allowlist에 없으면 4xx로 거절하고, confidence를 재임계처리하거나 cooldown/hourly cap으로 억제하지 않는다. dispatch면 `AlertWriterService.writeAlert()`가 `originEventId`와 Event dedup key를 idempotency key로 Alert를 쓴다. `AlertWriterService`는 in-process promise queue로 alert insert를 직렬화해 `alertSeq` 할당, transaction commit, SSE emit 순서를 맞춘다. Kakao fan-out/outbox 계열은 `backend/src/alerts/services/alert-events.service.ts`의 `ensureOutboxForIngest()`, `backend/src/alerts/repositories/alert-events.repository.ts`, `backend/src/alerts/ports/channel.port.ts`, `backend/src/alerts/adapters/kakao-send-to-me-channel.adapter.ts`가 담당하며, `DeliveryAttempt` 상태와 delivery result를 저장한다.

## SSE와 read-side 연결

Dashboard는 `GET /api/v1/dashboard/stream`로 two-frame alert stream을 받는다. `DashboardStreamController`는 `JwtAuthGuard`와 `RequireFacilityGuard`를 사용하고, `Last-Event-ID`를 `bigint alertSeq` cursor로 해석해 `AlertsService.replay(facilityId, lastSeq)`로 backlog를 먼저 흘린다. live 준비가 끝나면 `AlertWriterService.subscribe()`와 `subscribeUpdates()`에서 오는 `event: alert` / `event: alert-updated` frames를 emit한다. stream 중에도 `AuthService.isSessionVersionCurrent()`로 session re-auth tick을 돌려 invalid session이면 `event: session-invalid` 후 종료한다.

SSE frame shape, replay, and session invalid semantics는 wire contract 문서인 `../api/realtime-events.md`가 정본이고, 여기서는 backend 내부 연결만 설명한다.

## References

- [전체 시스템 아키텍처](../architecture.md)
- [Frontend 아키텍처](./frontend.md)
- [Edge device 아키텍처](./edge-device.md)
- [Alert pipeline domain](../domain/alert-pipeline.md)
- [Data model domain](../domain/data-model.md)
- [Edge ingest API](../api/edge-ingest-api.md)
- [Dashboard API](../api/dashboard-api.md)
- [Realtime events API](../api/realtime-events.md)
- [Kakao delivery API](../api/kakao-delivery-api.md)
- [Backend layering rule](../rules/backend-layering.md)
- [REST API convention](../rules/rest-api-convention.md)
- [DTO convention](../rules/dto-convention.md)
- [Backend architecture lint & guard](../rules/backend-architecture-lint-and-guard.md)
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
- ADR
