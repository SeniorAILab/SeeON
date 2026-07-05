# ADR: Phase-1 eldercare realtime-detection cross-runtime contracts (PR-B0 gate)

Scope: the frozen, reviewed contracts that the Phase-1 working-first execution
(worker → ml-api → backend) references. This is a contract gate: it changes no
product behavior. Implementing PRs (camera RTSP field, event audit columns, ML
config endpoint, config pull, audit envelope, night window) reference these
frozen shapes so multi-hop `extra="forbid"` retrofits and security decisions are
settled before code depends on them. Source plan:
`docs/exec-plan/`-class consensus plan approved for this work (ralplan final,
session `019f2c4b`).

## Decision

- **(a) Config-read auth — Phase-1 simple trust (user-accepted).** The
  worker→ml-api config-read route reuses the existing `X-Edge-Relay-Token`
  (`RELAY_TOKEN_HEADER` / `_authorize` in `ml/api/routes/ingest_relay.py`); no new
  worker token or env. The ml-api→backend config-read call and the ml-api→backend
  snapshot upload use the SAME no-HMAC network-trust model as the existing
  `POST /api/v1/events` ingress — network reachability on the edge LAN is the
  trust boundary. No dedicated config-service bearer token is introduced in
  Phase-1.
- **(b) RTSP storage — Phase-1 plaintext, write-only.** Backend `Camera` gains a
  nullable plaintext `rtspUrl` (field name must NOT imply encryption). Contract:
  write-only — settable via the dashboard camera create/update, NEVER returned by
  any read DTO/presenter, NEVER logged (no structured-log field, no error-message
  echo). It leaves the backend only via the ML-plane config-read response consumed
  by ml-api.
- **(c) `config_version`.** Monotonic integer per facility on a new
  `MlFacilityConfig` table (`facilityId` unique, `configVersion Int`), incremented
  in the same transaction as any camera or night-window mutation. ml-api and
  worker treat it as opaque monotonic (act on `!=` / `>`, never decode).
- **(d) Night-window shape.** `MlFacilityConfig.nightStart` (HH:MM),
  `nightEnd` (HH:MM), `tz` (IANA), matching worker `NightWindowConfig`
  validation in `ml/worker/edge_worker_config.py`. Facility-level in v1 (one
  window per facility).
- **(e) Durable edge last-known-good (LKG).** The worker persists each
  successfully pulled config (plus its `config_version`) as JSON under
  `ML_WORKER_STATE_DIR` (default `/var/lib/ml-worker/`, mounted as a compose
  volume). Precedence is **pulled > LKG > YAML bootstrap**. Cold start with
  ml-api/backend unreachable boots from LKG if present, else YAML, keeps retrying
  the pull with backoff, and never blocks detection startup on pull success.
- **(f) Event-created-first snapshot.** The in-memory MJPEG/latest-frame buffer
  is not durable evidence. At detection the worker captures the overlay JPEG bytes
  synchronously (size-bounded, ≤200KB) and a deterministic `correlation_key` =
  local `sha256(cameraId|detectedAt-ISO|type)` (byte-parity-tested against backend
  `buildEventDedupKey`). ml-api POSTs `/api/v1/events` FIRST (backend creates or
  dedup-resolves the Event and returns its id), THEN uploads the bytes to a
  snapshot route that reuses the existing Alert snapshot machinery
  (`resolveSnapshotPath` / `SNAPSHOT_DIR`, key `facilityId/<event.id>.<ext>`);
  the backend derives the key from the CREATED event id, never a client-supplied
  path, sets `Event.snapshotKey`, and denormalizes it to the derived Alert via
  `originEventId`. Snapshot upload is best-effort: failure never blocks Event
  ingestion (snapshotKey stays null; on success `Alert.snapshotKey == Event.snapshotKey`).
- **(g) Frozen audit-envelope field list.** Each emitted event carries exactly:
  `config_version`, `model_version`, `detector_version`, `operating_threshold`,
  `detected_at`, `camera_id`, `snapshot_key` (nullable), `clock_source` (constant
  `edge_wall_clock` in Phase-1). Implementing PRs reference this list; no PR may
  alter it without a new decision.
- **Invariant.** The worker→ml-api relay paths `/api/v1/relay/*` and
  `RELAY_TOKEN_HEADER` auth are preserved verbatim; the one-way event flow
  (worker never calls backend directly) is unchanged. ml-api additionally serves a
  worker-facing config-read route and pulls backend config; it remains the sole
  backend-facing edge process.

## Drivers

- Working-demo stability: nothing may destabilize the load-bearing
  worker→ml-api→backend path on CPU compose.
- `extra="forbid"` multi-hop retrofit cost: contract shapes must be frozen before
  any hop implements them.
- Triple-copy camera identity (backend row / `API_CAMERA_INVENTORY` / worker YAML)
  is eliminated by a backend-SSOT pull path that must ride on a frozen relay.
- Audit-trail durability: an in-memory frame pointer is not evidence for
  false-positive review in an eldercare safety system.
- User-owned Phase-1 simplicity/risk tradeoff for a trusted edge LAN, single
  facility.

## Alternatives considered

- **Dedicated config-service bearer token + AES-256-GCM RTSP encryption in
  Phase-1:** rejected via the intent-reconciliation gate. Overridden by the user
  for Phase-1 simplicity on a trusted edge LAN; moved to Phase-2 hardening.
- **Camera-registration-first sequencing:** rejected — mutates worker boot/config
  while worker internals are unguarded (violates freeze-first).
- **Audit-envelope-first sequencing:** rejected — the envelope needs
  `config_version`, which only exists after the pull path; the SHAPE is frozen
  here instead.
- **Snapshot uploaded before Event ingest keyed by a fabricated eventId:**
  rejected — the eventId does not exist until the backend creates the Event; the
  Event-created-first flow above is used instead.
- **Per-space night windows / worker-YAML-owned night window as SSOT:** rejected
  for v1 — facility-level backend SSOT is the smallest correct shape; per-space is
  Phase-2.

## Why chosen

Freezing these contracts before implementation lets every high-blast-radius
change land on a test-gated path and keeps each cross-runtime hop additive.
Reusing the existing relay-token / network-trust model matches the deployment
reality (trusted edge LAN, single facility) and the user's explicit Phase-1 risk
acceptance, while the Event-created-first snapshot flow reuses proven backend
snapshot storage instead of inventing a new durable-evidence path.

## Consequences

- **[USER-ACCEPTED RISK]** Phase-1 stores `Camera.rtspUrl` write-only but
  UNENCRYPTED and reuses relay/network trust for config endpoints. Execution must
  not silently re-add token/crypto ceremony; review lanes treat this as WATCH, not
  BLOCK.
- Implementing PRs (`Camera.rtspUrl`, Event audit columns, `MlFacilityConfig`,
  config pull, audit envelope, night window) must reference the field names and
  flows frozen here; drift is a regression.
- `compose.edge.yaml` gains an `ML_WORKER_STATE_DIR` volume; `API_CAMERA_INVENTORY`
  is demoted from required to bootstrap fallback.
- The relay alert payload grows by a bounded snapshot (≤200KB) on the local
  loopback hop only.

## Follow-ups (Phase-2 hardening, deferred)

- At-rest RTSP encryption + key rotation and a dedicated config-service auth
  credential.
- DeepStream/GPU perception backend behind the `FrameObservation(+track_id)` seam;
  RESTful rename/alias of `/api/v1/relay/*`; full React/OpenClaw ML dashboard +
  `aiOpsControl` RBAC enforcement; ONVIF/NVR auto-discovery; detected-event video
  → backend → frontend; per-space night windows; evidence retention / PHI policy;
  durable event replay.
- Keep `docs/api/route-inventory.md`, `docs/api/edge-ingest-api.md`,
  `docs/api/ml-serving-api.md`, `docs/architecture.md`, and
  `scripts/env/verify-compose-env-contract.mjs` cross-checked against the new
  config-read route and env contract when the implementing PRs land (PR-10).
