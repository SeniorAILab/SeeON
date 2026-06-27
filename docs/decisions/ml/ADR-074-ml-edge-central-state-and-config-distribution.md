# ADR-074: ML edge/central state and config-distribution responsibility split

## Status

Accepted

## Date

2026-06-25

## Context

The ML edge/api MECE boundary refactor (ADR-067) raised a recurring question:
"where does state live, and does central storage violate the zero-cross-boundary
-shared-state invariant?" The night-only bed-exit requirement makes it concrete:
detection must run only at night, the night window must be operator-adjustable,
and the product (backend/dashboard) must be able to drive that configuration.

Industry practice corroborates the split: 2025–2026 CCTV/VMS/edge-AI systems run
inference at the edge while management (VMS) owns rules/arming-schedules
centrally and distributes them to edge devices, and config distribution favors
pull for scale. Commercial eldercare fall-detection products (IntelliSee,
KamiCare, SafelyYou, Darwin Edge) are edge/on-premise with signal-only egress.

## Decision

ML state is split into three categories with distinct owners. There is no
cross-boundary shared **mutable runtime** state between `ml-api` and `ml-worker`.

1. **Policy CONFIG** (night-window value, domain enable/disable, per-facility
   settings): owned by the **backend** as the single source of truth, distributed
   to the edge as **immutable snapshots**. The edge holds a local last-known-good
   copy and keeps enforcing during central/backend outages (edge autonomy). This
   is owner + copy, not shared state. Distribution is **pull**: `ml-api` is the
   single backend-facing process and the worker pulls config from `ml-api`
   (the worker runs no inbound server; no second FastAPI in the worker).
2. **Events / facts** (fall, bed-exit, heartbeat): produced by the **worker**,
   forwarded **upward** via `worker -> ml-api /api/v1/relay/* -> backend /api/v1/events`.
3. **Runtime / flow state** (detection windows, onset/cooldown latches, camera
   liveness/status, latest-frame buffers): **process-local**, never shared.
   The worker owns its detection/liveness/dedup state; `ml-api` owns a separate
   relay-heartbeat-derived view for `/status`.

Enforcement vs value: the **edge (worker) enforces** the night window (it is part
of the bed-exit incident definition — daytime bed-exit is not an incident); the
**backend owns the adjustable value**. No double-gating of the night window in the
backend.

## Consequences

- "Central stores config" is true and correct: it is single-owner policy data
  distributed as immutable snapshots, which does not violate
  zero-cross-boundary-shared-mutable-state. Config flows down (snapshot/pull),
  events flow up, runtime state stays local.
- Edge autonomy is preserved: last-known-good config keeps night detection
  running if `ml-api`/backend are unreachable.
- The boundary refactor adds no central state today (night-window stays in worker
  YAML); central-owned, runtime-adjustable distribution is deferred.

## Alternatives Considered

### Collapse worker + api into one process

Rejected. ADR-067 and industry practice separate the inference engine from the
API/gateway: API availability and RTSP stream health have different lifecycles,
and centralizing backend credentials/signing/egress in one gateway is the safer
pattern. Collapsing regresses availability isolation and credential containment.

### Backend pushes config into the edge

Not preferred. A backend→edge inbound push enlarges the edge attack surface and
requires an inbound server on the edge. `ml-api`-initiated pull (and worker pull
from `ml-api`) keeps `ml-api` the single backend-facing initiator, consistent
with signal-only egress.

## Follow-ups

- Dynamic control plane (dashboard-driven night-window + domain toggle via
  `frontend -> backend -> ml-api -> worker` pull-config): SeniorAILab/eldercare-fall-ai#382.

## References

- [ADR-067: ML Edge Worker And API Relay Contract](./ADR-067-ml-edge-api-worker-service-split.md)
- [ADR-029: Per-site edge inference with signal-only egress](./ADR-029-edge-inference-deployment-topology.md)
- [ADR-023: ML/backend prediction boundary](../common/ADR-023-ml-backend-prediction-boundary.md)
- Edge AI vs Cloud AI for video surveillance (2026): https://forasoft.medium.com/edge-ai-wins-for-video-surveillance-2026-latency-cost-breakdown-ec69ed62df67
- Hanwha Vision video surveillance trends 2026: https://www.hanwhavision.com/en/news-center/1651433/
- OTA update modes (pull vs push scaling): https://saince.io/2020/08/24/ota-update-modes/
- IntelliSee on-premise fall detection: https://intellisee.com/solutions/fall-detection/
