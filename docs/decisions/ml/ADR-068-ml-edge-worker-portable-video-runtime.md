# ADR-068: ML Edge Worker Portable Video Runtime

## Status

Accepted. Complements ADR-067; does not supersede it.

## Date

2026-06-23

## Context

ADR-067 split the ML edge process into `ml-api` and `ml-worker`.
That split fixes ownership: production camera loops belong to the worker, while
FastAPI remains the local API surface for health, status, models, debug
prediction, and control.

The next constraint is portability. The live path must run on constrained edge
hardware now and leave room for GPU/video acceleration later without changing
backend ingest contracts or moving RTSP ownership back into FastAPI.

## Decision

The production live path is:

```text
RTSP -> ml-worker -> ml-api -> backend /api/v1/events
```

`ml-worker` owns production RTSP capture, model/domain evaluation, heartbeat fact creation, and alert/fact creation. It relays those facts to local `ml-api` at `/api/v1/relay/*`; `ml-api` publishes no-HMAC backend `POST /api/v1/events` and `POST /api/v1/events/heartbeat` per ADR-067/029.

`ml-api` is private/local edge infrastructure. It exposes FastAPI
health, status, model, debug, and bounded control surfaces. It does not own
production RTSP streams or receive raw frame relay from the worker; it does own
the backend ingest gateway side effects defined by ADR-067/029.

The current RTSP/video backend is OpenCV. The code may keep a small backend
adapter boundary so future GStreamer, NVIDIA DeepStream, or NVIDIA Triton
adapters can be added without changing worker scheduling, domain detectors,
event schemas, or backend ingest. Those are future adapters only; this ADR does
not add them as dependencies.

Jetson Nano is a legacy/constrained target. It is valid only as a
hardware-gated deployment target with explicit smoke evidence, reduced stream
settings, and no claim of general GPU support. Future NVIDIA dGPU support
requires release-matrix pinning across driver, CUDA, container runtime,
DeepStream or Triton version, base image, PyTorch/Ultralytics compatibility, and
model artifact format before deployment.

### Edge build platform and Jetson Nano B01 GPU

Release image builds pin each image's target architecture as a constant rather
than a deploy-time flag: host images (`backend`, `front`) build for
`linux/amd64`, while edge images (`ml-api`, `ml-worker`) build for
`linux/arm64`. The edge runtime remains the current CPU stack:
Python 3.11, `torch>=2.3`, and `ultralytics>=8.3`.

Jetson Nano B01 GPU acceleration is deferred. Nano's practical GPU stack is
JetPack 4.6, CUDA 10.2, and Python 3.6, which caps GPU PyTorch around 1.10.
PyTorch 2.x GPU support requires CUDA 11 / JetPack 5+ hardware, and current
Ultralytics requires Python >=3.8. Downgrading to a Nano-compatible YOLOv5-era
stack would also remove pose/keypoint support needed by the fall-pose pipeline,
so "just downgrade versions" is effectively a separate dev-versus-Nano dual
stack and violates this ADR's portable runtime position.

This is consistent with the existing ADR-068 position: Jetson Nano is a
legacy/constrained, hardware-gated target, not a general GPU-support claim, and
future dGPU support requires an explicit release matrix. If CPU edge runtime FPS
is insufficient after real Nano measurement, the follow-up path is TensorRT
export or replacing the board with Jetson Orin (JetPack 5/6, native torch 2.x GPU
support while keeping the current stack). Track that follow-up in GitHub issue
#417.

`EDGE_CAMERA_CONFIG` remains the edge-worker runtime input for camera RTSP URLs and domain/model settings. Backend Event API URL configuration and outbox/retry belong to `ml-api` per ADR-067/029 and must stay outside git.

## MECE boundary

| Concern | Owning ADR |
|---|---|
| API process vs production camera worker process split | ADR-067 |
| Portable video runtime backend policy, current OpenCV backend, and future adapter boundary | ADR-068 |
| Per-site edge topology and signal-only egress | ADR-029 |
| ML/backend policy and side-effect ownership | ADR-023 |
| Frame observation, runner contracts, package layout, and FastAPI route surface | ADR-057 |

## Alternatives Considered

### Route worker frames through FastAPI

Rejected. It makes FastAPI a production raw-frame relay and blurs ADR-067's
process boundary. It also creates an unnecessary local network hop before
backend ingest.

### Adopt DeepStream or Triton now

Rejected for this slice. They may be correct future adapters, but adding them
now would couple the worker to a vendor release matrix before real edge hardware
selection and benchmarking are complete.

### Treat Jetson Nano as the default edge platform

Rejected. Jetson Nano is useful for legacy/constrained validation only. It has
limited memory and an older software stack, so it cannot be the default support
claim for the runtime.

## Consequences

- Documentation and runbooks must describe native development as
  `pnpm dev:ml-api` for FastAPI and `pnpm dev:ml-worker` for the worker, while edge
  deployment uses `compose.edge.yaml`.
- Nursing-home video published through RTSP and relayed through `ml-api` to the real backend
  `/api/v1/events` implementation is the default portable E2E verification path
  when real cameras or Jetson hardware are absent.
- Real four-camera and Jetson Nano checks are hardware-gated and must be
  reported separately from deterministic smoke success.
- Future accelerated video backends can be added behind the worker video
  backend boundary without changing the `ml-api` relay or backend Event API contracts.

## Changelog

- 2026-06-25: 라이브 경로를 `RTSP -> ml-worker -> ml-api -> backend /api/v1/events`로 갱신.
- 2026-06-27: issue #388 cutover updates backend egress to no-HMAC Event API via `API_BACKEND_EVENTS_URL` and worker relay to `/api/v1/relay/*`.
