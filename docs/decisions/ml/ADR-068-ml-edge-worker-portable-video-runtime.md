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
RTSP -> ml-worker -> backend /ingest/*
```

`ml-worker` owns production RTSP capture, model/domain evaluation,
heartbeat publishing, and alert/fact publishing to backend `/ingest/alerts` and
`/ingest/heartbeat`.

`ml-api` is private/local edge infrastructure only. It exposes FastAPI
health, status, model, debug, and bounded control surfaces. It does not own
production RTSP streams, does not receive raw frame relay from the worker, and
does not perform backend ingest side effects.

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

`EDGE_CAMERA_CONFIG` remains the edge-worker secret/config input. It contains
per-camera RTSP URLs, backend ingest endpoints, key IDs, and signing secrets and
must stay outside git.

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
- Nursing-home video published through RTSP and sent to the real backend
  `/ingest/*` implementation is the default portable E2E verification path
  when real cameras or Jetson hardware are absent.
- Real four-camera and Jetson Nano checks are hardware-gated and must be
  reported separately from deterministic smoke success.
- Future accelerated video backends can be added behind the worker video
  backend boundary without changing backend `/ingest/*` contracts.
