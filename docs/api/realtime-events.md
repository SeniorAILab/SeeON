# Realtime events

`GET /api/v1/dashboard/stream` is the authenticated dashboard SSE stream.

- Controller: `backend/src/dashboard/sse.controller.ts`.
- Auth: `JwtAuthGuard` + `RequireFacilityGuard`.
- Facility scope: facility-bound users use their JWT `facilityId`; `SUPER_ADMIN` selects a facility with `facilityId=<id>` query param for native `EventSource` clients or `X-Facility-Id: <id>` for fetch/XHR requests. The frontend `buildSseUrl()` uses the query param because browser `EventSource` cannot set custom headers.
- Cookie auth only; the frontend does not send bearer tokens.
- Replay cursor: `Last-Event-ID` is parsed as bigint `alertSeq`.

The stream is room/space-centric and emits exactly two normal named frames: `event: alert` and `event: alert-updated`. There are no resident status, status delta, or snapshot frames in the current contract.

## Connect and replay

1. The backend subscribes to live alert and lifecycle-update events before replay to avoid a replay/live handoff gap.
2. When `Last-Event-ID` is present and valid, the backend replays facility-scoped alerts where `alertSeq > Last-Event-ID`, ordered by `alertSeq`.
3. Live `alert` frames buffered during replay are emitted when their `alertSeq` is greater than the replay high-watermark.
4. Live `alert-updated` frames buffered during replay are emitted after replay. They do not carry an SSE `id:` line and are not cursor-filtered.
5. The stream stays live with comment heartbeats.

## `event: alert`

Created alert frame. The SSE `id:` is the alert sequence and is the only replay cursor.

```text
id: 42
event: alert
data: {"id":"alert_cuid","alertSeq":"42","spaceId":"space_cuid","cameraId":"camera_cuid","type":"fall","status":"OPEN","probability":0.91,"detectedAt":"2026-07-03T00:00:00.000Z"}

```

Payload fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Alert id. |
| `alertSeq` | string | Bigint sequence serialized as a string. Mirrors the SSE `id:` value. |
| `spaceId` | string | Space/room anchor for dashboard grouping. |
| `cameraId` | string | Camera that produced the ML event. |
| `type` | string | Canonical lowercase event type accepted by the backend. |
| `status` | string | Current alert lifecycle status. |
| `probability` | number or null | ML confidence as received through Event API. Backend does not re-threshold it for ingest acceptance. |
| `detectedAt` | string | ISO timestamp from the ML event. |

## `event: alert-updated`

Lifecycle update frame for resolved alerts. It intentionally has no SSE `id:` line because lifecycle updates do not mint a new `alertSeq`; missed lifecycle updates are recovered by reloading REST read models.

```text
event: alert-updated
data: {"id":"alert_cuid","alertSeq":"42","spaceId":"space_cuid","status":"RESOLVED","resolvedById":"user_cuid","resolvedAt":"2026-07-03T00:05:00.000Z"}

```

Payload fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Alert id. |
| `alertSeq` | string | Original alert sequence for client correlation only. |
| `spaceId` | string | Space/room anchor for dashboard grouping. |
| `status` | string | Updated lifecycle status. |
| `resolvedById` | string or null | User that resolved the alert when status is resolved. |
| `resolvedAt` | string or null | Resolution timestamp when status is resolved. |

## Control/error frames

The stream can emit implementation-visible control frames before closing:

- `event: replay-error` when backlog replay fails before live mode.
- `event: session-invalid` when periodic JWT `sessionVersion` revalidation fails.

These are diagnostics/control signals, not dashboard state. The old bare `GET /sse` path is removed; use `GET /api/v1/dashboard/stream`.
