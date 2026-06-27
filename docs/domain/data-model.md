# Backend relationship data model SSOT

Status: 타겟 모델(합의됨); 스키마 remodel은 room-centric remodel PR들(PR3~8)로 진행 중. Until those PRs land, `backend/prisma/schema.prisma` still contains transitional legacy fields such as `Camera.residentId`, `Space.cameraId`, required `Alert.residentId`, `Resident.room`, and `Role = OWNER | ADMIN`.

This document is the canonical relationship reference for backend domain docs. Field names below use product/API camelCase unless explicitly marked as database or ingest fields.

## Naming and API relation rules

- Prisma and product `/api/*` DTO fields use camelCase: `facilityId`, `spaceId`, `residentId`, `cameraId`, `alertSeq`.
- Database columns and ML Event API payload fields use snake_case: `facility_id`, `space_id`, `resident_id`, `camera_id`, `alert_seq`.
- Tenant-domain foreign keys must include `facilityId` and use composite references such as `(facilityId, spaceId) -> Space(facilityId, id)` so cross-facility references are impossible at the database layer.
- Product `/api/*` responses may include nested relation labels, but must not expose raw Prisma models. The Event API remains source-oriented and snake_case.

## RLS enrollment and facility scope

`Facility` is the root tenant table and is not an RLS list/query surface. Auth/root tables (`User`, `KakaoIdentity`, `ServerSession`) are gated by authenticated user/session logic and app-layer facility membership.

Tenant-domain tables must have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, must be queried under the `app.facility_id` GUC, and must use `facility_id` in relationship constraints:

- `floors`
- `spaces`
- `zones`
- `residents`
- `resident_assignments`
- `guardians`
- `cameras`
- `alerts`
- `resident_statuses`

`AlertEvent` and `DeliveryAttempt` are backend-owned outbox tables, not tenant list/read models. They are intentionally non-RLS and are keyed through `sourceId`/`externalEventId` and `alertEventId` rather than tenant query surfaces.

## Entity relationships

| Entity | Scope | Cardinality and FK direction | Notes |
|---|---|---|---|
| `Facility` | Root tenant | `Facility` 1→N `Floor`, `Space`, `Zone`, `Resident`, `ResidentAssignment`, `Guardian`, `Camera`, `Alert`, `ResidentStatus`, `User`, `KakaoIdentity`, `ServerSession` through each child's `facilityId` where present. | Root of facility ownership. Facility itself is not tenant-RLS. |
| `Floor` | Tenant/RLS | `Floor(facilityId) -> Facility(id)`; `Facility` 1→N `Floor`; `Floor` 1→N `Space`. | Floor remains canonical because the frontend and operations model are floor-aware. |
| `Space` | Tenant/RLS | `Space(facilityId) -> Facility(id)`; `Space(facilityId, floorId) -> Floor(facilityId, id)`; `Floor` 1→N `Space`; `Space` 1→N `Zone`; `Space` 1:1 `Camera` via `Camera.spaceId`; `Space` 1→N `ResidentAssignment`; `Space` 1→N `Alert`. | Canonical room/physical-place anchor. `Space.cameraId` is transitional legacy only and is removed by the remodel. |
| `Camera` | Tenant/RLS | Target: `Camera(facilityId) -> Facility(id)` and `Camera(facilityId, spaceId) -> Space(facilityId, id)` with `UNIQUE(facilityId, spaceId)`. `Space` 1:1 `Camera`; `Camera` 1→N `Alert` as source. | Camera belongs to a room/space, not a resident. `Camera.residentId` is legacy and removed by the remodel. |
| `Zone` | Tenant/RLS | `Zone(facilityId) -> Facility(id)`; `Zone(facilityId, spaceId) -> Space(facilityId, id)`; `Space` 1→N `Zone`; `Zone` 1→N `ResidentAssignment` when a resident is placed in a sub-area. | Optional placement refinement inside a space. |
| `Resident` | Tenant/RLS | `Resident(facilityId) -> Facility(id)`; `Facility` 1→N `Resident`; `Resident` 1→N `ResidentAssignment`; `Resident` 1→N `Guardian`; `Resident` 0/1→1 `ResidentStatus`; `Resident` 0→N `Alert` only when the person is known. | Canonical placement is not `Resident.room`; placement is assignment history. |
| `ResidentAssignment` | Tenant/RLS | `ResidentAssignment(facilityId) -> Facility(id)`; `(facilityId, residentId) -> Resident(facilityId, id)`; `(facilityId, spaceId) -> Space(facilityId, id)`; optional `(facilityId, zoneId) -> Zone(facilityId, id)`. | Represents resident placement and movement history. Active placement is `startedAt <= now` and `endedAt IS NULL`; historical lookup uses the event timestamp. |
| `Guardian` | Tenant/RLS | `Guardian(facilityId) -> Facility(id)`; `(facilityId, residentId) -> Resident(facilityId, id)`; `Resident` 1→N `Guardian`. | Emergency-contact data linked to one resident within the same facility. |
| `Alert` | Tenant/RLS | Target: `Alert(facilityId) -> Facility(id)`; required `(facilityId, spaceId) -> Space(facilityId, id)`; optional `(facilityId, cameraId) -> Camera(facilityId, id)` as source; optional `(facilityId, residentId) -> Resident(facilityId, id)` when known. `Space` 1→N `Alert`; `Camera` 0/1→N `Alert`; `Resident` 0/1→N `Alert`. | `spaceId` is NOT NULL and is the historical room anchor. `cameraId` records the source. `residentId` is nullable for empty-room/unknown-person alerts. |
| `ResidentStatus` | Tenant/RLS | `ResidentStatus(facilityId) -> Facility(id)`; `(facilityId, residentId) -> Resident(facilityId, id)`; optional `(facilityId, sourceId) -> Camera(facilityId, id)`. `Resident` 1→0/1 `ResidentStatus`. | Resident-centric current-state read model. Empty-room alerts skip resident status updates. |
| `User` | Auth/root | Optional `User(facilityId) -> Facility(id)`; `Facility` 1→N `User`. `User` 1→0/1 `KakaoIdentity`; `User` 1→N `ServerSession`; `User` 1→N `DeliveryAttempt` as recipient. | RBAC target role set is `SUPER_ADMIN | ADMIN | CAREGIVER`. `SUPER_ADMIN`/`ADMIN` are personal login roles; `CAREGIVER` is the facility shared TV/monitor dashboard view, not a personal caregiver account. |
| `KakaoIdentity` | Auth/root | `KakaoIdentity(userId) -> User(id)`; optional `KakaoIdentity(facilityId) -> Facility(id)`; `User` 1→0/1 `KakaoIdentity`. | OAuth/self-notification identity for a facility-bound user. |
| `ServerSession` | Auth/root | `ServerSession(userId) -> User(id)`; optional `ServerSession(facilityId) -> Facility(id)`; `User` 1→N `ServerSession`. | Server-side session/revocation root. Tenant-domain access starts only after authenticated facility binding. |
| `AlertEvent` | Backend outbox, non-RLS | No tenant-domain FK. `AlertEvent` 1→N `DeliveryAttempt`; idempotency key is `(sourceId, externalEventId)`. | Delivery/outbox audit row keyed by ingest/source identity. Keep separate from dashboard `Alert` read model. |
| `DeliveryAttempt` | Backend outbox, non-RLS | `DeliveryAttempt(alertEventId) -> AlertEvent(id)`; optional `DeliveryAttempt(recipientUserId) -> User(id)`; `AlertEvent` 1→N `DeliveryAttempt`; `User` 0/1→N `DeliveryAttempt`. | Per-channel/per-recipient delivery state. It is non-RLS delivery infrastructure, not a tenant list surface. |

## Target cardinality summary

```text
Facility 1 -> N Floor
Facility 1 -> N Space
Facility 1 -> N Camera
Facility 1 -> N Resident
Facility 1 -> N Alert
Facility 1 -> N User

Floor 1 -> N Space
Space 1 -> 1 Camera          (Camera.spaceId unique FK)
Space 1 -> N Zone
Space 1 -> N Resident        (through ResidentAssignment history)
Space 1 -> N Alert           (Alert.spaceId NOT NULL)
Resident 1 -> N ResidentAssignment
Resident 1 -> N Guardian
Resident 1 -> 0..1 ResidentStatus
Resident 0..1 -> N Alert     (Alert.residentId nullable)
Camera 0..1 -> N Alert       (Alert.cameraId source)
AlertEvent 1 -> N DeliveryAttempt
User 1 -> N ServerSession
User 1 -> 0..1 KakaoIdentity
User 0..1 -> N DeliveryAttempt
```

## Transitional differences from current schema

Current `backend/prisma/schema.prisma` is not yet the final target. During the remodel:

- `Camera.residentId` remains only as legacy compatibility until camera runtime no longer depends on resident placement.
- `Space.cameraId` is a transitional claim used for strict backfill; final ownership is `Camera.spaceId`.
- `Alert.residentId` is currently required; target is nullable after `Alert.spaceId` is established.
- `Resident.room` is legacy free text; target placement is `ResidentAssignment` only.
- `Role = OWNER | ADMIN` is legacy; target RBAC is `SUPER_ADMIN | ADMIN | CAREGIVER` with a backend SSOT.
