---
status: ACCEPTED
date: 2026-06-25
owner: ml
---

# ADR-071: RTSP Publisher Externalized

## Context

The ML edge worker is a stream consumer. This repository previously also carried
a local video-to-RTSP publisher script and a `pnpm dev:rtsp` command. That mixed
fixture generation with the production intake boundary and made it easier to
mistake a helper publisher for part of the eldercare runtime.

<vault> field notes identify the S1 site RTSP shape as IDIS-style
`trackID=<channel>&streamID=<stream>` for NVR streams, with substream `2` used for
low-sensitivity smoke work. The local fixture still has to run on a general media
server that can expose browser-viewable HLS.

## Decision

This repository does not own RTSP publishing. It only consumes configured RTSP
URLs through `ml-worker`.

Video-file-to-RTSP fixture generation is owned by the external
`SeniorAILab/rtsp-generator` repository. That tool defaults to vendor `s1`, with
channel `1` and stream `2`, and prints RTSP plus browser-viewable HLS URLs.

`scripts/ml-worker-nursing-home-backend-e2e.sh` accepts `NURSING_HOME_RTSP_URL`
and writes that URL into the worker config. It does not start MediaMTX, FFmpeg,
or any local RTSP publisher.

## Consequences

- E2E evidence for this repo stays focused on `RTSP -> ml-worker -> backend
  /ingest/* -> DB side effect`.
- Developers who need a synthetic RTSP source start `rtsp-generator` separately
  and pass a worker-reachable URL, typically using `host.docker.internal` when
  the worker runs in Docker.
- Future vendor fanout belongs in `rtsp-generator`, not in this repository.
- MediaMTX path restrictions mean the local S1 fixture uses a safe equivalent
  path while preserving S1 channel/stream defaults in the generator interface.
