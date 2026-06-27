---
status: ACCEPTED
date: 2026-06-25
owner: ml
---

# ADR-075: RTSP Publisher Externalized

This ADR is the single canonical record for why this repository does not generate
RTSP and how it consumes externally generated streams. Other docs (README, ML
README, AGENTS) describe the live path or standing rules but do not restate this
rationale.

## Context

The ML edge worker is a stream **consumer**. This repository previously also
carried a local video-to-RTSP publisher script and a `pnpm dev:rtsp` command.
That mixed fixture generation with the production intake boundary and made it easy
to mistake a helper publisher for part of the eldercare runtime, and to present
synthetic-input plumbing as real fall-detection E2E evidence.

<vault> field notes identify the S1 site RTSP shape as IDIS-style
`trackID=<channel>&streamID=<stream>` for NVR streams, with substream `2` used for
low-sensitivity smoke work. A local fixture still has to run on a general media
server that can expose browser-viewable HLS so a developer can confirm the stream
visually.

## Decision

1. **Consumer-only boundary.** This repository does not own RTSP publishing. It
   only consumes configured RTSP URLs through `ml-worker`. It must not carry
   MediaMTX orchestration, FFmpeg publishing loops, file-to-RTSP scripts, or any
   synthetic publisher.

2. **Generation is delegated to the external `SeniorAILab/rtsp-generator`.** That
   tool loops a local video file, runs MediaMTX + FFmpeg, and exposes a
   vendor-shaped RTSP stream. It defaults to vendor `s1` (channel `1`, stream
   `2`); MediaMTX path restrictions mean the local fixture uses a safe equivalent
   path while preserving the S1 channel/stream defaults in the generator
   interface.

3. **The generator owns browser-viewable HLS verification.** The same published
   stream is exposed as browser-viewable HLS, and proving "RTSP and HLS are
   simultaneously live" is the generator repository's responsibility, not this
   repository's. RTSP `ffprobe` readiness alone is not evidence that the browser
   HLS view works.

4. **Host-only dev invocation.** Running the generator for local development is a
   host-only convenience: the dev worker runs on the host and consumes
   `127.0.0.1` RTSP URLs directly. The generator is never packaged into this
   repository's Docker/Compose, and the dev path never uses a container-host
   bridge address.

5. **Anti-pattern: a dev RTSP fixture as a Compose/Docker service.** Packaging a
   dev RTSP generator/fixture/publisher as a Compose or Docker service is
   forbidden — it disguises a fixture as real infrastructure and turns
   mock-as-real plumbing into fake E2E evidence.

6. **Legitimate exception: production-shaped worker-in-Docker.** A production
   `ml-worker` running in Docker that *consumes* an externally supplied, real RTSP
   URL is legitimate and is not the anti-pattern. RTSP that arrives through the CLI
   is trusted external input; only packaging the generator itself as a service is
   banned.

## Consequences

- E2E evidence for this repo stays focused on `RTSP -> ml-worker -> ml-api ->
  backend /api/v1/events -> DB side effect`.
- Developers who need a synthetic RTSP source start `rtsp-generator` separately on
  the host and point a worker config at the printed `127.0.0.1` RTSP URL.
- `scripts/ml-worker-nursing-home-backend-e2e.sh` accepts `NURSING_HOME_RTSP_URL`
  and writes that URL into the worker config. It does not start MediaMTX, FFmpeg,
  or any local RTSP publisher.
- `ml/tests/test_edge_topology_contract.py` guards the active script and package
  surface against reintroducing RTSP-generation tooling (for example
  `rtsp-loop-video`, `dev:rtsp`, or `mediamtx`).
- Future vendor fanout and HLS/browser verification belong in `rtsp-generator`,
  not in this repository.

## Changelog

- 2026-06-25: Thickened into the single canonical RTSP-non-generation record.
  Added the host-only `127.0.0.1` dev-invocation boundary, generator-owned
  browser-HLS verification, the dev-fixture-as-Compose/Docker-service anti-pattern,
  and the legitimate worker-in-Docker external-URL exception. Consolidated
  externalization rationale that previously appeared in README and ML README.
