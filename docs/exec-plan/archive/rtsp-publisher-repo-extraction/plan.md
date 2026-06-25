---
slug: rtsp-publisher-repo-extraction
status: done
created: 2026-06-25
author: codex
---

# Plan: RTSP Publisher Repo Extraction

## Evidence

- Ataraxia field notes identify the S1 site as IDIS-style RTSP:
  NVR `trackID=<channel>&streamID=<stream>` and camera `trackID=<stream>`.
- MediaMTX can receive RTSP and expose a compatible local fixture path over
  browser-viewable HLS, but it does not accept raw `=` and `&` path segments.
- This repo currently owns `scripts/rtsp-loop-video.sh` and a `dev:rtsp`
  command, which conflicts with the desired consumer-only boundary.

## Steps

1. Create the external `SeniorAILab/rtsp-generator` repository.
2. Implement a Python CLI that stages one input video, starts MediaMTX and an
   FFmpeg publisher container, and prints RTSP plus HLS URLs.
3. Add tests for URL/path construction and Docker command planning.
4. Verify the CLI with a generated sample video, `ffprobe`, and HLS reachability.
5. Refactor eldercare-fall-ai scripts so E2E flows receive `NURSING_HOME_RTSP_URL`
   instead of creating RTSP.
6. Remove local RTSP publishing entry points and update docs/contracts.
7. Run targeted tests and shell syntax checks.

## Risks

- Local Docker Desktop path sharing can reject arbitrary video paths. The CLI
  should stage input under a runtime directory before mounting.
- Browser HLS startup has a short delay after RTSP publish begins. Verification
  should wait for stream readiness instead of assuming immediate availability.
- S1 may deploy different OEM camera lines; keep `s1` as a vendor default and
  isolate future vendor fanout in the external generator.
