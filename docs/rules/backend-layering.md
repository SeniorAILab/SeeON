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

Controllers must not own business policy, idempotency rules, tenant-state transitions, Prisma error repair, or external delivery logic. `backend/src/ingest/ingest.controller.ts` is the current cautionary example: it validates freshness, checks tenant coherence, derives the idempotency key, catches Prisma `P2002`, writes the dashboard alert, and ensures the outbox inline. That behavior is correct domain behavior, but the controller is not the correct owner. `backend/src/dashboard/sse.controller.ts` is allowed to own SSE transport details, but domain event formatting still belongs in presenter-mapper helpers.

### DTO + parser

DTOs and parsers own the external request/response shape:

- Required fields and validation errors.
- String-to-number/date/bigint coercion.
- JSON naming boundary, especially snake_case external fields to camelCase service inputs.
- Response DTO shape and serialization of `bigint`/`Date` values.

Examples already present:

- `backend/src/alerts/dto/alert-events.dto.ts` defines snake_case alert-event boundary DTOs such as `source_id`, `external_event_id`, `detected_at`, and `fall_probability`.
- `backend/src/alerts/adapters/ml-serving-prediction.adapter.ts` parses the ML response and rejects missing `fall_probability`, `operating_threshold`, or `is_fall`.

Inline controller DTOs such as `IngestAlertBody` in `backend/src/ingest/ingest.controller.ts` are transition-only; stable DTOs live under the domain `dto/` folder.

### Service

Services own use-case orchestration:

- Authz-after-authentication checks that require loaded domain state.
- Idempotency, policy, deduplication, and state transition decisions.
- Sequencing repository writes and adapter calls.
- Converting domain outcomes into use-case result objects.

Examples:

- `backend/src/alerts/alert-writer.service.ts` owns serialized alert writes, `ResidentStatus` updates, and post-commit SSE emission order.
- `backend/src/alerts/services/alert-events.service.ts` owns alert-event orchestration: duplicate detection, alert policy evaluation, outbox creation, Kakao recipient fan-out, and delivery result recording.
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
- ML serving prediction: `backend/src/alerts/adapters/ml-serving-prediction.adapter.ts`.
- Filesystem snapshot storage/proxying currently sits in `backend/src/alerts/alerts.controller.ts`; new work must move filesystem effects behind an adapter/service seam instead of expanding controller file I/O.

Adapters do not decide whether an alert should exist or whether a notification should be sent. They execute the external call and report success/failure precisely. Never fake Kakao or ML success.

### Presenter-mapper

Presenter-mappers own entity-to-response and stream-frame formatting:

- Prisma/domain entity to REST response DTO.
- BigInt and Date serialization.
- SSE frame shape, event name, `id`, and JSON payload.

Current examples are helper functions in `backend/src/dashboard/sse.controller.ts`: `formatAlertEvent`, `formatStatusEvent`, and `formatSseEvent`. They define the dashboard stream contract and should remain presentation-only. REST endpoints such as `backend/src/alerts/alerts.controller.ts` should use response DTO/presenter helpers instead of returning raw Prisma query results.

## Retained seams are first-class

Retained-but-currently-unused seams must be documented and tested, never silently orphaned. The `ALERT_PREDICTION_PORT` and `MlServingPredictionAdapter` registered through `backend/src/alerts/alerts.module.ts` are the canonical example: the live MVP alert ingress is `/ingest/alerts`, while the prediction port is a future backend-prediction path. It must keep a focused adapter test (`backend/src/alerts/adapters/ml-serving-prediction.adapter.spec.ts`) and documentation explaining why it exists. Removing, bypassing, or leaving such seams untested creates a false contract and is not allowed.
