# ADR: Phase-1 eldercare realtime-detection delivery (PR-10 docs)

Scope: the delivered Phase-1 additive-seams design for the eldercare realtime-detection path. This records what is now implemented and documented across backend, `ml-api`, `ml-worker`, edge Compose env, and API docs. Companion contract gate: [`adr-phase1-eldercare-realtime-detection-contracts.md`](adr-phase1-eldercare-realtime-detection-contracts.md).

## Decision

- **(a) Worker decoupling seams are delivered.** Live worker internals keep additive seams for later acceleration without changing the current CPU path: `FrameObservation` carries observation facts including `track_id`; tracking is behind `TrackerProtocol`; frame decoding accepts decode-backend injection; runners expose capability sets; device selection is device-agnostic through `select_device`.
- **(b) Backend is the ML config SSOT.** Backend `Camera.rtspUrl` is nullable plaintext and write-only for browser/admin camera create/update APIs: settable, never returned by camera read DTOs, and never logged. It leaves the backend only through `GET /api/v1/ml-config/:facilityId` for the ML plane. `MlFacilityConfig` owns the facility-level night window and monotonic `config_version`, bumped in the same transaction as camera or night-window mutations.
- **(c) Event audit and snapshots are backend-owned.** `Event` has nullable audit columns for `configVersion`, `modelVersion`, `detectorVersion`, `operatingThreshold`, `snapshotKey`, and `clockSource`. `POST /api/v1/events` accepts the additive snake_case audit envelope while preserving envelope-less compatibility. Snapshot persistence is Event-created-first: `ml-api` posts the event first, then uploads bytes to `PUT /api/v1/events/:eventId/snapshot`; backend derives the key, rejects client keys, sets `Event.snapshotKey`, and backfills derived `Alert.snapshotKey`.
- **(d) `ml-api` is a config gateway, not a dumb relay.** It pulls backend config from `GET /api/v1/ml-config/:facilityId` at boot and per worker `GET /api/v1/relay/config` request using `API_BACKEND_CONFIG_URL` + `API_FACILITY_ID` as primary env. `API_CAMERA_INVENTORY` is demoted to fallback/bootstrap inventory. `ml-api` seeds its camera binding table from backend config, exposes worker-facing config and restart routes, forwards alert audit envelopes, and performs Event-created-first snapshot upload.
- **(e) Worker LKG, restart, and live night-window are delivered.** The worker persists pulled config under `ML_WORKER_STATE_DIR` and resolves config with precedence **pulled > LKG > YAML**. Cold start with ml-api/backend unreachable uses LKG when available, otherwise YAML. `restart_epoch` is exposed by `ml-api`; a worker that observes an increase over its boot value clean-exits with status `0`, letting Compose `restart: unless-stopped` relaunch it. The live night window is backend-owned on `MlFacilityConfig` and reaches the worker through pulled config.
- **(f) Phase-1 trust posture is edge-LAN network trust (user-accepted).** Worker↔ml-api reuses `X-Edge-Relay-Token`; ml-api↔backend config/event/snapshot hops use the same no-HMAC network-trust model as Event API ingress. RTSP URLs are plaintext write-only in backend storage. This is an explicit Phase-1 risk acceptance, not a hidden production-hardening claim.

## Drivers

- Preserve the working CPU edge path while adding seams for GPU/DeepStream/Triton and richer ops controls later.
- Remove triple-copy camera configuration by making backend the SSOT without introducing Phase-1 token/crypto ceremony.
- Keep worker→ml-api→backend one-way event flow unchanged: worker never calls backend directly, and backend never calls into edge.
- Make audit and snapshot evidence durable enough for eldercare false-positive review while avoiding fabricated pre-event storage keys.
- Keep config updates live and operator-controllable through additive routes instead of changing the prediction/runtime architecture.

## Alternatives considered

- **DeepStream/GStreamer/GPU + Triton in Phase-1:** rejected for delivery risk; the seams are present, but the runtime remains CPU-compatible.
- **Dedicated config-service auth + RTSP encryption before config pull:** rejected by the Phase-1 intent reconciliation; moved to Phase-2 hardening.
- **Worker calling backend directly for config/events/snapshots:** rejected because it breaks the single backend-facing edge process invariant.
- **Backend pushing config/restart to ml-api/worker:** rejected because the deployed topology is pull-only and avoids backend→edge egress.
- **Snapshot-first upload keyed by a client/fabricated key:** rejected; the backend Event id must exist before the durable snapshot key is derived.
- **Per-space night windows in Phase-1:** rejected; facility-level `MlFacilityConfig` is the delivered v1 policy shape.

## Why chosen

The delivered design keeps the load-bearing realtime path stable while eliminating camera-config drift and adding durable audit/snapshot evidence. Backend remains the tenant/config/persistence owner, `ml-api` remains the sole backend-facing edge process, and the worker stays edge-local with LKG fallback. The additive routes and env changes match the companion PR-B0 contract decision without forcing Phase-2 security or GPU work into Phase-1.

## Consequences

- **[USER-ACCEPTED RISK]** `Camera.rtspUrl` is plaintext at rest and Phase-1 config/event/snapshot hops rely on edge-LAN network trust. Review lanes should flag this as the documented Phase-2 hardening item, not as an undisclosed defect.
- `API_BACKEND_CONFIG_URL` + `API_FACILITY_ID` are primary edge production env for config pull. `API_CAMERA_INVENTORY` is fallback only. `ML_WORKER_STATE_DIR` backs durable worker LKG.
- `GET /api/v1/ml-config/:facilityId` is the only backend route that returns `rtspUrl`.
- `POST /api/v1/events` remains backward compatible with envelope-less clients while storing the additive audit fields when present.
- Event snapshots are best-effort after event creation; failed snapshot upload leaves `snapshotKey` null and does not reject event ingestion.

## Follow-ups (Phase-2 hardening, deferred)

- DeepStream/GStreamer/GPU perception backend and Triton serving integration.
- RESTful rename/alias of `/api/v1/relay/*`.
- React/OpenClaw ML-ops dashboard and full `aiOpsControl` RBAC enforcement.
- ONVIF/NVR discovery.
- Event video path from edge/backend to frontend.
- At-rest RTSP encryption, rotation, and dedicated config-service authentication.
- Per-space night windows.
