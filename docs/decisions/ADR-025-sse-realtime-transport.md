# ADR-025: SSE Realtime Transport — Read-Only Cookie-Auth Push with alertSeq Replay

## Status

Accepted

## Date

2026-06-13

## Context

The NOC admin dashboard must display fall alerts in near-real-time (target: sub-second transport
after ingest, AC6). Three transport options were considered: polling, Server-Sent Events (SSE),
and WebSocket (WebSocket / socket.io).

The dashboard consumption model is **unidirectional**: the server pushes alert events to the
browser; the browser acknowledges alerts via ordinary REST calls, not over the same transport.
This is a pure push stream — the browser does not send data back on the realtime channel.

Additional constraints:

- Session authentication must use the `app_session` httpOnly cookie (ADR-023). `EventSource` does
  not support the `Authorization` header, so the auth mechanism must be cookie-based.
- The SSE origin must be the same as the front origin (Next.js rewrite `/sse → backend:3000/sse`)
  so the first-party cookie is included automatically.
- Alert events must be delivered without gaps or reordering across reconnects (life-safety
  requirement: no distinct alert may be dropped — plan pre-mortem 2).
- The system is a single-instance MVP at this stage. Multi-instance fan-out (LISTEN/NOTIFY) is an
  explicit deferral.
- Dominant latency in the fall detection pipeline is the ML inference window (~seconds), not the
  transport hop (~milliseconds). Transport optimization beyond SSE sub-second is not the binding
  constraint.

The plan Architect (stage-02) and Critic (stage-06) assessed the transport choice. Issue #36
("realtime transport ADR") is closed by this ADR.

## Decision

### 1. Server-Sent Events over HTTP/1.1 (read-only push)

`GET /sse` (proxied via Next rewrite from the browser) opens a persistent SSE connection:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

The backend flushes individual events as they are committed (not buffered to a batch interval).
The browser's native `EventSource` API reconnects automatically on drop; the backend supports
resumption via `Last-Event-ID`.

**Cookie authentication**: the `app_session` cookie is included automatically because the
request goes to the single front origin. The SSE handler validates the session JWT and checks
`ServerSession.revokedAt` on connect and on each keep-alive tick (configurable interval, e.g.,
30 s). A revoked or expired session causes the server to close the stream — logout semantically
severs the stream within one keep-alive tick (ADR-023 consequence).

**Null-org rejection**: a session whose `orgId` is null (pre-onboarding) is rejected with 403
before the stream opens. Only fully onboarded sessions reach the stream.

### 2. `alertSeq` as the SSE `id` field and `Last-Event-ID` cursor

Every SSE event carries:

```
id: <alertSeq>
event: alert
data: { "alertSeq": "...", "residentId": "...", ... }
```

`alertSeq` is the `Alert.alertSeq` bigserial (ADR-024) — a monotonically increasing integer, not
the CUID PK. The browser's `EventSource` records the last received `id` as `Last-Event-ID` and
sends it on reconnect.

On reconnect, the backend replays:

```sql
SELECT * FROM alerts
WHERE org_id = current_setting('app.org_id', true)::text
  AND alert_seq > $lastEventId
ORDER BY alert_seq ASC;
```

This delivers every committed alert that arrived since the last acknowledged event, in strict
insert order, with no gaps.

### 3. REST re-snapshot of `ResidentStatus` on reconnect

The alert event log replay (via `Last-Event-ID`) restores the alert feed, but the dashboard's
current-state grid (resident status badges) is derived from `ResidentStatus` (ADR-024), not the
event log. On reconnect, the client performs a separate `GET /status` REST call to re-fetch the
full `ResidentStatus` snapshot for all org residents. This decouples the event log (what happened)
from the current state (what is true now) and avoids replaying state-change events.

### 4. Single-consumer in-process write queue (serialized alertSeq emit)

To guarantee that `alertSeq` assignment order equals commit order equals emit order, the alert
ingest path uses a **per-org in-process write queue** (or Postgres advisory lock
`pg_advisory_xact_lock` keyed per `orgId`). The sequence is: acquire lock → insert alert (receives
`alertSeq`) → commit transaction → emit SSE event. Only after commit does the event reach the SSE
channel. Clients sort and deduplicate by `alertSeq`; the server guarantees no out-of-order live
emission.

This means:

- No event is emitted before its alert row is durable.
- No later-sequenced alert can be emitted before an earlier-sequenced one whose commit races.
- The interleaved-insert reconnect test (concurrent ingest from multiple cameras during a
  client drop/reconnect) must assert every committed `alertSeq` is delivered exactly once and
  in order.

### 5. Single-instance MVP; multi-instance fan-out deferred

In the MVP, a single backend process holds all SSE connections. The in-process write queue works
because all writers share the same process memory. When the system scales to multiple backend
instances, the queue must be replaced by a Postgres `LISTEN/NOTIFY` channel (each instance
subscribes; any instance that receives an ingest event notifies all); this is explicitly deferred.

The deferral is conscious: the ML inference window (seconds) dominates end-to-end alert latency;
transport and instance count do not affect that window. A single instance is sufficient until
load justifies the operational cost of Postgres pub/sub or a message broker.

## Decision Drivers

- **D1 — Unidirectional push only**: the dashboard receives alerts; it does not send data
  over the realtime channel. A bidirectional transport adds unnecessary complexity.
- **D2 — Cookie-auth requirement**: `EventSource` does not support `Authorization` headers.
  SSE over the first-party origin (Next rewrite) delivers the `app_session` cookie automatically.
  WebSocket can use cookies too, but also supports tokens in the handshake URL — an attack surface
  not needed here.
- **D3 — No-gap replay via `Last-Event-ID`**: SSE `Last-Event-ID` gives the protocol a built-in
  resumption mechanism. WebSocket would require a custom application-level replay protocol.
- **D4 — ML window is the latency bottleneck**: the fall detection ML model processes a temporal
  window of frames (seconds). Transport sub-second delivery is trivially achievable with SSE; the
  binding latency is the ML pipeline, not the push channel.
- **D5 — Operational simplicity at PoC scale**: SSE is a plain HTTP response; it works through
  HTTP/1.1, proxies, and the Next.js rewrite without protocol upgrade negotiation. WebSocket
  requires upgrade handling and proxy configuration.

## Alternatives Considered

### WebSocket / socket.io

A bidirectional WebSocket connection where the server pushes alert events and the client could
optionally send data back (e.g., inline acknowledgement).

- Pros: bidirectional; well-supported client libraries (socket.io); can carry ACK messages over
  the same connection.
- Cons:
  - **Bidirectional is unnecessary**: ACK is a rare user action best handled as a standard REST
    call. Bundling it into the WebSocket channel complicates the server event model and the
    session-revocation semantics (must also close the WS connection on logout).
  - **Protocol upgrade**: WebSocket requires HTTP→WS upgrade; the Next.js `http-proxy-middleware`
    used for rewrites does not transparently upgrade WebSocket connections without additional
    configuration.
  - **socket.io adds a dependency**: a custom framing protocol, room management, namespace
    concepts, and an npm package. None of these are needed for a unidirectional alert feed.
  - **No protocol-native replay**: socket.io's `Last-Event-ID` equivalent is custom; must be
    implemented from scratch anyway.
  - **ML window dominates latency**: the performance argument for WebSocket (lower per-message
    overhead) is irrelevant when the bottleneck is seconds, not milliseconds.
- **Rejected**: bidirectional transport is not needed; overhead of WS upgrade + proxy config +
  socket.io dependency exceeds benefit. SSE is strictly sufficient for unidirectional push.

### Long polling

Client polls `GET /alerts?since=<timestamp>` on a configurable interval (e.g., 1–2 s).

- Pros: stateless server; trivially works behind any proxy; no persistent connection management.
- Cons: latency floor = poll interval; missed events between polls require careful `since` cursor
  management; server-side fan-out (many clients × many requests/second) is higher than one
  persistent SSE connection per client; harder to keep the cursor consistent with `ResidentStatus`.
- **Rejected**: latency floor is unacceptable for a sub-second dashboard target (AC6), and the
  complexity of a correct cursor mechanism under concurrent inserts approaches SSE complexity
  without the native protocol support.

### Postgres LISTEN/NOTIFY with per-instance SSE fan-out (immediate multi-instance)

Stand up LISTEN/NOTIFY from the start so every backend instance receives alert notifications
and fans out to its local SSE connections.

- Pros: horizontally scalable from day one; no in-process queue coupling.
- Cons: requires a persistent Postgres LISTEN connection per backend process, careful
  reconnect logic if the LISTEN connection drops, and operational understanding of Postgres
  notification payload size limits (8 KB). Additional complexity for a PoC with one instance.
- **Deferred, not rejected**: the in-process write queue is the single-instance equivalent
  of LISTEN/NOTIFY. When multi-instance scale is required, the queue is replaced by NOTIFY
  in the ingest writer and LISTEN in the SSE handler — an additive change to the alert writer
  service, not a redesign.

### Client-side EventSource with `Authorization` query parameter

Pass the session token in the URL (`/sse?token=<jwt>`) for `EventSource` authentication instead
of relying on cookies.

- Pros: works for any EventSource URL regardless of origin; cookie not required.
- Cons: tokens in URLs appear in server logs, proxy logs, browser history, and `Referer` headers.
  A JWT in a log line is a leaked credential. The httpOnly cookie is specifically designed to
  prevent JavaScript access to the session token; surfacing it in a URL defeats that property.
- **Rejected**: security regression relative to the httpOnly cookie model (ADR-023).

## Consequences

**Positive:**

- Sub-second alert delivery for a single-instance deployment (AC6) without any additional
  infrastructure (message broker, Redis, etc.).
- `Last-Event-ID` replay is protocol-native; no custom application-level replay protocol needed.
- Cookie authentication is automatic via the first-party Next rewrite; no token plumbing in
  the SSE client code.
- In-process write queue is simple, auditable, and requires no external dependencies at MVP scale.
- Logout semantically closes the SSE stream within one keep-alive tick (ADR-023).

**Negative / trade-offs:**

- Single-instance constraint: the in-process write queue does not work across process boundaries.
  Horizontal scale requires replacing the queue with LISTEN/NOTIFY (deferred).
- SSE over HTTP/1.1 holds one TCP connection per tab per browser. In HTTP/2, multiple SSE
  streams multiplex over one connection; HTTP/1.1 browsers have a per-origin connection limit
  (typically 6). For a staff dashboard with one active SSE tab this is not a problem; a
  multi-tab scenario needs HTTP/2 or the LISTEN/NOTIFY fan-out upgrade.
- `alertSeq` is a `BigInt` in Postgres/Prisma; must be serialized as a string in JSON payloads
  and the SSE `id` field (ADR-024 follow-up).
- The interleaved-insert reconnect test (concurrent inserts + drop/reconnect) is a required
  acceptance test for AC8, not optional. It must run as the `app_runtime` DB role (ADR-022).

## Follow-ups

- AC6 sub-second SSE delivery must be verified against the chosen Next rewrite path (not assumed);
  unbuffered response confirmed in the NestJS SSE controller.
- F10 (Critic): verify the Next 16 rewrite does not buffer the `text/event-stream` response
  (default Next response helpers may buffer); use a raw `http.ServerResponse` or a NestJS
  `@Sse()` decorator that writes directly to the socket.
- AC8 interleaved-concurrent-insert reconnect test: fire concurrent ingest from ≥2 cameras
  while the client drops mid-flight; assert no gap, no duplicate, and strict `alertSeq` order
  in the replay.
- Multi-instance upgrade path: when horizontal scale is required, add `pg_notify('alerts',
  json_build_object(...))` in the alert writer transaction and replace the in-process queue with
  a per-process `pg_listen` subscriber that fans out to local SSE connections. This is an additive
  change; the SSE client protocol (Last-Event-ID, event format) is unchanged.
- SSE keep-alive tick interval should be configurable via `SSE_KEEPALIVE_SECONDS` env var
  (default 30 s); the session re-validation happens on each tick.
