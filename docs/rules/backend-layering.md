# Backend layering convention

Backend code is layered by responsibility. A file may be temporarily out of compliance during refactors, but new code must move toward these boundaries instead of adding more controller/service/repository leakage.

## Layer responsibilities

### Controller

Controllers own HTTP only:

- Route path, method, guards/interceptors, headers, and status code.
- Reading `@Param`, `@Query`, `@Body`, `@Req`, and `@Res` values.
- Calling a DTO parser/mapper or handing raw request values to a boundary DTO constructor.
- Calling exactly one use-case service method for the request.
- Mapping use-case results to response DTOs/presenters.

Controllers must not own business policy, idempotency rules, tenant-state transitions, Prisma error repair, or external delivery logic. `backend/src/events/events.controller.ts` is the current thin-controller example: it accepts no-HMAC Event API JSON, parses event/heartbeat DTOs, and delegates event creation/heartbeat use cases to services. Tenant coherence, idempotency, dashboard alert writes, and outbox orchestration belong in services/repositories/adapters. `backend/src/dashboard/sse.controller.ts` is allowed to own SSE transport details, but domain event formatting still belongs in presenter-mapper helpers.

### DTO + parser

DTOs and parsers own the external request/response shape:

- Required fields and validation errors.
- String-to-number/date/bigint coercion.
- JSON naming boundary, especially snake_case external fields to camelCase service inputs.
- Response DTO shape and serialization of `bigint`/`Date` values.

Examples already present:

- `backend/src/events/dto/*.dto.ts` defines the Event API boundary DTOs for snake_case fields such as `camera_id`, `type`, `detected_at`, and `confidence`.
- `backend/src/alerts/dto/alert-events.dto.ts` defines retained alert-event/outbox DTOs such as `source_id`, `external_event_id`, `detected_at`, and `fall_probability`.

### Service

Services own use-case orchestration:

- Authz-after-authentication checks that require loaded domain state.
- Idempotency, policy, deduplication, and state transition decisions.
- Sequencing repository writes and adapter calls.
- Converting domain outcomes into use-case result objects.

Examples:

- Event services own `POST /api/v1/events` orchestration: camera resolution, tenant coherence, idempotency, Event persistence, and downstream alert/outbox creation.
- `backend/src/alerts/alert-writer.service.ts` owns serialized alert writes, `ResidentStatus` updates, and post-commit SSE emission order.
- `backend/src/alerts/services/alert-events.service.ts` owns retained alert-event orchestration for the repository/ports/adapters contract: duplicate detection, alert policy evaluation, outbox creation, Kakao recipient fan-out, and delivery result recording.
- `backend/src/alerts/services/alert-policy.service.ts` owns alert dispatch/suppression policy.

Services may call repositories and adapters. Services must not return raw Prisma models directly to controllers when a response DTO/presenter exists.

### Repository

Repositories own Prisma database access only:

- Prisma query/update/create/upsert calls.
- Transactions used to keep persistence atomic.
- Mapping between DTO/use-case input and Prisma write data.
- Database uniqueness races as persistence facts, not product policy.

Repositories must not decide alert policy, delivery policy, authz, SSE frame shape, or HTTP status codes. `backend/src/alerts/repositories/alert-events.repository.ts` is the reference: it reads/writes `AlertEvent` and `DeliveryAttempt`, enforces persistence idempotency via `(sourceId, externalEventId)`, and records delivery results. Domain decisions still come from `AlertEventsService` and `AlertPolicyService`.

### Adapter

Adapters own external systems and translate their failure modes into domain/service-level results:

- Kakao Talk send-to-me delivery: `backend/src/alerts/adapters/kakao-send-to-me-channel.adapter.ts`.
- Filesystem snapshot storage/proxying currently sits in `backend/src/alerts/alerts.controller.ts`; new work must move filesystem effects behind an adapter/service contract instead of expanding controller file I/O.

Adapters do not decide whether an alert should exist or whether a notification should be sent. They execute the external call and report success/failure precisely. Never fake Kakao or Event API ML-confidence success.

### Presenter-mapper

Presenter-mappers own entity-to-response and stream-frame formatting:

- Prisma/domain entity to REST response DTO.
- BigInt and Date serialization.
- SSE frame shape, event name, `id`, and JSON payload.

Current examples are helper functions in `backend/src/dashboard/sse.controller.ts`: `formatAlertEvent`, `formatStatusEvent`, and `formatSseEvent`. They define the dashboard stream contract and should remain presentation-only. REST endpoints such as `backend/src/alerts/alerts.controller.ts` should use response DTO/presenter helpers instead of returning raw Prisma query results.

## Retired contracts are removed deliberately

Retired contracts must not remain documented as retained seams. The old `ALERT_PREDICTION_PORT` / `MlServingPredictionAdapter` backend-pull path is removed; live ML ingress is `POST /api/v1/events` with Event API `confidence`. Reintroducing backend-pull prediction requires a successor decision and focused tests.
