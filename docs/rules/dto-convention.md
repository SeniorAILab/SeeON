# DTO convention

DTOs are the boundary contract for HTTP and external-service edges. They are not optional documentation; they are the code shape that keeps docs, backend, frontend, and ML aligned.

## External JSON shape

At the external edge/backend boundary:

- JSON field names are `snake_case`.
  - Ingest alert fields: `resident_id`, `facility_id`, `snapshot_url`, `detected_at`.
  - Alert-event outbox fields: `source_id`, `external_event_id`, `detected_at`.
  - ML prediction response fields: `fall_probability`, `operating_threshold`, `is_fall`.
- Timestamps are ISO-8601 UTC strings. DTO parsers convert to `Date` only after validating the string.
- Probabilities are finite floats in `[0, 1]`.
  - `probability`, `confidence`, and `fall_probability` all use this range.
- IDs are strings. Do not expose numeric database internals as resource IDs.
- Event type strings are kebab-case.
  - Current examples in `backend/src/alerts/dto/alert-events.dto.ts`: `fall`, `detection-lost`.

## Internal naming

- Backend service/repository inputs may use camelCase after the DTO parser has crossed the boundary.
- Frontend internal state may use camelCase after a mapper converts API JSON.
- The snake_case/camelCase conversion must happen at a named mapper/parser boundary, not by ad-hoc property reads spread across components or services.

## Backend response rule

The backend never returns raw Prisma models as the intended public contract. Use a response DTO or presenter-mapper that explicitly chooses fields and serializes non-JSON-native values.

Reasons grounded in current code:

- `alertSeq` is a `BigInt` and must become a string in SSE and REST DTOs.
- `Date` values must serialize as ISO timestamps, not leak arbitrary object/string behavior.
- Prisma relations such as `resident` may include more data than a route should expose if returned directly.

Transition examples:

- `backend/src/dashboard/sse.controller.ts` already maps alert events through `formatAlertEvent` and status events through `formatStatusEvent`.
- `backend/src/alerts/alerts.controller.ts` currently returns service results from Prisma-backed queries; new work should introduce explicit alert response DTO/presenter helpers instead of expanding this pattern.

## DTO placement

DTOs live at the controller boundary under the owning domain folder:

```text
backend/src/<domain>/dto/*.dto.ts
```

Examples:

- `backend/src/ingest/dto/ingest-alert.dto.ts` owns the `/ingest/alerts` request DTO/parser used by the thin ingest controller.
- `backend/src/alerts/dto/alert-events.dto.ts` owns retained alert-event/outbox, ML prediction, and alert-event response DTOs.

A service type is not automatically a DTO. Service inputs may express use-case needs after validation/coercion; DTOs express the external contract before and after the request crosses the controller boundary.
