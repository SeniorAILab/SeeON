# Backend relationship data model

Status: v1 backend schema is room-centric. The resident/guardian domain (`residents`, `resident_assignments`, `guardians`, `resident_statuses` tables and Prisma models, `Alert.residentId`, and the `ResidentState` + `Level` enums) has been dropped, not kept as transitional state; resident/guardian capabilities return in v2 as a new schema/API. `backend/prisma/schema.prisma` now uses room-centric `Camera.spaceId`, required `Alert.spaceId`, and `Role = SUPER_ADMIN | ADMIN | STAFF`.

This document is the backend relationship reference derived from the PRD/API contract. Field names below use product/API camelCase unless explicitly marked as database or ingest fields.

## Naming and API relation rules

- Prisma and product `/api/*` DTO fields use camelCase: `facilityId`, `spaceId`, `cameraId`, `alertSeq`.
- Database columns and ML Event API payload fields use snake_case: `facility_id`, `space_id`, `camera_id`, `alert_seq`.
- Tenant-domain foreign keys must include `facilityId` and use composite references such as `(facilityId, spaceId) -> Space(facilityId, id)` so cross-facility references are impossible at the database layer.
- Product `/api/*` responses may include nested relation labels, but must not expose raw Prisma models. The Event API remains source-oriented and snake_case.

## RLS enrollment and facility scope

`Facility` is the root tenant table and is not an RLS list/query surface. Auth/root tables (`User`, `KakaoIdentity`) are gated by authenticated user/session logic and app-layer facility membership.

Tenant-domain tables must have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, must be queried under the `app.facility_id` GUC, and must use `facility_id` in relationship constraints:

- `floors`
- `spaces`
- `cameras`
- `alerts`

`AlertEvent` and `DeliveryAttempt` are backend-owned outbox tables, not tenant list/read models. They are intentionally non-RLS and are keyed through `sourceId`/`externalEventId` and `alertEventId` rather than tenant query surfaces.

## Entity relationships

| Entity | Scope | Cardinality and FK direction | Notes |
|---|---|---|---|
| `Facility` | Root tenant | `Facility` 1→N `Floor`, `Space`, `Camera`, `Alert`, `User`, `KakaoIdentity` through each child's `facilityId` where present. | Root of facility ownership. Facility itself is not tenant-RLS. |
| `Floor` | Tenant/RLS | `Floor(facilityId) -> Facility(id)`; `Facility` 1→N `Floor`; `Floor` 1→N `Space`. | Floor remains canonical because the frontend and operations model are floor-aware. |
| `Space` | Tenant/RLS | `Space(facilityId) -> Facility(id)`; `Space(facilityId, floorId) -> Floor(facilityId, id)`; `Floor` 1→N `Space`; `Space` 1:1 `Camera` via `Camera.spaceId`; `Space` 1→N `Alert`. | Canonical room/physical-place anchor. |
| `Camera` | Tenant/RLS | `Camera(facilityId) -> Facility(id)` and `Camera(facilityId, spaceId) -> Space(facilityId, id)` with `UNIQUE(facilityId, spaceId)`. `Space` 1:1 `Camera`; `Camera` 1→N `Alert` and `Event` as source. | Camera belongs to a room/space, not a resident. |
| `Alert` | Tenant/RLS | `Alert(facilityId) -> Facility(id)`; required `(facilityId, spaceId) -> Space(facilityId, id)`; optional `(facilityId, cameraId) -> Camera(facilityId, id)` as source. `Space` 1→N `Alert`; `Camera` 0/1→N `Alert`. | `spaceId` is NOT NULL and is the historical room anchor. `cameraId` records the source. |
| `User` | Auth/root | Optional `User(facilityId) -> Facility(id)`; `Facility` 1→N `User`. `User` 1→0/1 `KakaoIdentity`; `User` 1→N `DeliveryAttempt` as recipient. | RBAC target role set is `SUPER_ADMIN | ADMIN | STAFF`, labeled 시스템 관리자 / 원장님 / 요양보호사. `SUPER_ADMIN`/`ADMIN` have facility administration capability; `STAFF` can create personal sessions and view the monitor dashboard but cannot administer the facility. |
| `KakaoIdentity` | Auth/root | `KakaoIdentity(userId) -> User(id)`; optional `KakaoIdentity(facilityId) -> Facility(id)`; `User` 1→0/1 `KakaoIdentity`. | OAuth/self-notification identity for a facility-bound user. |
| `AlertEvent` | Backend outbox, non-RLS | No tenant-domain FK. `AlertEvent` 1→N `DeliveryAttempt`; idempotency key is `(sourceId, externalEventId)`. | Delivery/outbox audit row keyed by ingest/source identity. Keep separate from dashboard `Alert` read model. |
| `DeliveryAttempt` | Backend outbox, non-RLS | `DeliveryAttempt(alertEventId) -> AlertEvent(id)`; optional `DeliveryAttempt(recipientUserId) -> User(id)`; `AlertEvent` 1→N `DeliveryAttempt`; `User` 0/1→N `DeliveryAttempt`. | Per-channel/per-recipient delivery state. It is non-RLS delivery infrastructure, not a tenant list surface. |

## Target cardinality summary

```text
Facility 1 -> N Floor
Facility 1 -> N Space
Facility 1 -> N Camera
Facility 1 -> N Alert
Facility 1 -> N User

Floor 1 -> N Space
Space 1 -> 1 Camera          (Camera.spaceId unique FK)
Camera 0..1 -> N Alert       (Alert.cameraId source)
AlertEvent 1 -> N DeliveryAttempt
User 1 -> 0..1 KakaoIdentity
User 0..1 -> N DeliveryAttempt
```

## Current schema notes

Current `backend/prisma/schema.prisma` is the v1 room-centric baseline:

- Cameras are assigned to spaces through `Camera.spaceId`.
- Alerts are anchored to spaces through required `Alert.spaceId`; `Alert.cameraId` is optional source metadata.
- User roles are `SUPER_ADMIN | ADMIN | STAFF`.
