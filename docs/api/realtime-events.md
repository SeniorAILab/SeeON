# Realtime Events

Dashboard realtime events are served by `GET /api/v1/dashboard/stream` as Server-Sent Events. The old bare `GET /api/v1/sse` path is removed and must not be used as an alias.

## Connection

```http
GET /api/v1/dashboard/stream
Cookie: app_session=...
Last-Event-ID: 42
Accept: text/event-stream
```

Auth:

- `SessionGuard`
- `RequireFacilityGuard`
- Session cookie auth; frontend does not send bearer tokens.

Headers:

- `content-type: text/event-stream`
- `cache-control: no-cache`
- `connection: keep-alive`
- `x-accel-buffering: no`

The stream writes an initial comment frame:

```text
: connected

```

Heartbeat comments are sent periodically:

```text
: heartbeat

```

## Last-Event-ID replay

`Last-Event-ID` is parsed as a bigint `alertSeq` cursor.

On reconnect:

1. Subscribe to live alert/status streams before replay to avoid a replay/live handoff gap.
2. Replay facility-scoped alerts where `alertSeq > Last-Event-ID` ordered by `alertSeq`.
3. Emit a full `event: status-snapshot` frame with current resident status.
4. Flush buffered live alert and status events with `alertSeq` greater than replay high-watermark.
5. Continue live streaming.

Invalid `Last-Event-ID` values skip replay rather than failing the connection.

## Alert event frame

Alert frames are unnamed SSE events: there is no `event:` line. The SSE `id` is the alert sequence, not the alert cuid.

```text
id: 43
data: {"alertSeq":"43","id":"alert_cuid","facilityId":"facility_cuid","residentId":"resident_cuid","cameraId":"camera_cuid","type":"fall","probability":0.97,"snapshotKey":null,"detectedAt":"2026-06-18T12:00:00.000Z","status":"OPEN","resident":null}

```

Rules:

- `id:` is `alertSeq`.
- `data.alertSeq` is stringified because JSON cannot safely represent bigint.
- Alert JSON is the dashboard read-model event emitted by backend; ML does not emit dashboard events.

## `event: status`

Live status delta emitted after ingest updates resident status.

```text
id: 43
event: status
data: {"alertSeq":"43","facilityId":"facility_cuid","residentId":"resident_cuid","state":"FALL","cameraOnline":true,"lastSeenAt":"2026-06-18T12:00:00.000Z"}

```

Rules:

- `id:` is the alert sequence associated with the state change.
- `state`, `cameraOnline`, and `lastSeenAt` mirror backend `ResidentStatus` read-model semantics.

## `event: status-snapshot`

Current status snapshot sent after replay on connect/reconnect.

```text
event: status-snapshot
data: [{"residentId":"resident_cuid","state":"NORMAL","cameraOnline":true}]

```

The exact object shape follows `StatusService.listByFacility` response. It seeds dashboard state before live deltas are applied.

## `event: session-invalid`

The backend periodically re-validates the session identity captured at connection time. If revoked, expired, version-rotated, or unverifiable, it emits:

```text
event: session-invalid
data: {}

```

The stream then closes. The frontend must treat this as a hard session refresh/logout signal.

## Error frames before live mode

Replay/status snapshot failures before live mode produce named error events and close the stream:

- `event: replay-error`
- `event: status-snapshot-error`

These are implementation-visible diagnostics, not normal dashboard state.

## Removed probe route

`GET /sse` is removed from the target contract. It was an auth/session probe returning `: auth-ok`, not the dashboard stream. Tests that used it must move to `/auth/session` or another documented probe.
