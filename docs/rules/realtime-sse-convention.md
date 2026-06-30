# Realtime SSE convention

SSE is a dashboard realtime surface only. The canonical route is:

```http
GET /api/v1/dashboard/stream
```

`backend/src/dashboard/sse.controller.ts` is the current server implementation. Frontend consumers must use `/api/v1/dashboard/stream` through the dashboard SSE client/proxy path; do not add parallel product streams without an decision.

## Authentication

- Auth is cookie-based with the `app_session` cookie.
- The route uses `SessionGuard` and `RequireFacilityGuard`, so every stream is bound to one authenticated facility.
- The stream periodically re-validates the server session. If the session is revoked, expired, or version-invalid, the server emits `event: session-invalid` and closes the stream.
- The legacy `/sse` auth probe is removed. Session checks use `/auth/session`; realtime clients use `/api/v1/dashboard/stream`.

## Event contract

### Unnamed alert event

Default unnamed SSE frames are alert events. The `id` field is `Alert.alertSeq` and the JSON payload includes the alert fields used by the dashboard.

Current formatter: `formatAlertEvent` in `backend/src/dashboard/sse.controller.ts`.

Shape:

```text
id: <alertSeq>
data: { ...alert }
```

### `event: status`

Live per-resident status delta emitted after a committed alert updates `ResidentStatus`.

Current formatter: `formatStatusEvent` in `backend/src/dashboard/sse.controller.ts`.

Shape:

```text
id: <alertSeq>
event: status
data: { "alertSeq": "...", "facilityId": "...", "residentId": "...", "state": "NORMAL|WARNING|FALL", "cameraOnline": true, "lastSeenAt": "..." }
```

### `event: alert-updated`

Live-only lifecycle delta emitted after an alert status transition (acknowledge
NEW→ACKED, resolve ACKED→RESOLVED) commits. It lets other connected dashboards
reflect ack/resolve without a reload.

**This frame MUST NOT include an `id:` line.** Status transitions do not mint a
new `alertSeq`, so reusing the alert's existing `alertSeq` as the SSE `id:` would
corrupt the `Last-Event-ID` cursor (a reconnecting client at/beyond that id would
skip the update; replay can only resurface alert rows). `alertSeq` therefore
appears only inside `data` for client correlation. `alert-updated` is **never
replayed** from `Last-Event-ID`; missed lifecycle state is recovered via REST
(`GET /api/v1/alerts`, `GET /api/v1/alerts/:id`, dashboard reload), whose payloads
carry current `status` plus the audit fields.

Current formatter: `formatAlertUpdateEvent` in `backend/src/dashboard/sse.controller.ts`.
Emitted by `AlertWriterService` lifecycle methods (`ackAlert`/`resolveAlert`) after commit.

Shape:

```text
event: alert-updated
data: { "alertSeq": "...", "id": "...", "facilityId": "...", "status": "ACKED|RESOLVED", "ackedById": null|"...", "ackedAt": null|"...", "resolvedById": null|"...", "resolvedAt": null|"..." }
```

### `event: status-snapshot`

Snapshot sent on connect/reconnect after backlog replay. It seeds current resident state so the dashboard can render consistently before live deltas arrive.

Shape:

```text
event: status-snapshot
data: [ ...current ResidentStatus rows... ]
```

### `event: session-invalid`

Control event emitted when periodic session re-auth fails. Clients must stop using the stream and refresh session state.

Shape:

```text
event: session-invalid
data: {}
```

## Replay

`Last-Event-ID` is the `Alert.alertSeq` replay cursor, not the `Alert.id` cuid. On reconnect, the server replays facility-scoped alerts where `alertSeq > Last-Event-ID`, ordered ascending, then sends `event: status-snapshot`, then begins live alert/status delivery.

`AlertWriterService.writeAlert()` is responsible for the causal order: commit `Alert`, update `ResidentStatus`, emit unnamed alert frame, then emit `event: status` with the same sequence key. SSE implementations must preserve that ordering and must not invent a second cursor.

The `event: alert-updated` lifecycle frame is **live-only and non-replayed**: it carries no `id:` line and is not part of `Last-Event-ID` replay. It does not mint a new `alertSeq`; clients recover missed ack/resolve state from the REST alert read models, not from the stream. The unnamed alert and `event: status` cursor behavior above is unchanged.

## Transport details

- Content type: `text/event-stream`.
- Cache: `no-cache`.
- Proxy buffering disabled with `X-Accel-Buffering: no`.
- Keepalive comments are allowed, e.g. `: heartbeat`.
- Replay or snapshot setup failures must fail visibly with a named error event before closing rather than silently serving a partial stream.
