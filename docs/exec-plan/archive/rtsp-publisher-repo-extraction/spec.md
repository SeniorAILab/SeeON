---
slug: rtsp-publisher-repo-extraction
status: done
created: 2026-06-25
author: codex
---

# Spec: RTSP Publisher Repo Extraction

## Goal

Move development RTSP publishing out of this repository. This repository should
only consume RTSP URLs, while a separate SeniorAILab repository owns the
video-file-to-RTSP fixture used for local and acceptance testing.

## User Outcome

- A developer can pass one video file to a CLI.
- The CLI continuously loop-publishes that video as an RTSP stream.
- The default vendor is S1, based on <vault> field notes for IDIS-style
  `trackID=<channel>&streamID=<stream>` semantics.
- The same stream is viewable in a browser through MediaMTX HLS.
- Existing eldercare-fall-ai workflows accept an already-running RTSP URL and do
  not contain RTSP publisher/server implementation.

## Scope

- Create or update `SeniorAILab/rtsp-generator`.
- Add a small Python CLI with tests and a README.
- Remove local RTSP publisher script ownership from eldercare-fall-ai.
- Update docs and tests that currently describe or assert local RTSP publishing.

## Non-Goals

- Do not emulate S1 device analytics, PTZ, NVR behavior, or authentication
  policy beyond URL shape and stream transport.
- Do not change the ML worker's RTSP consumption path.
- Do not add fake detector/backend behavior to E2E scripts.

## Acceptance

- The new CLI starts a looped RTSP stream from a video file.
- `ffprobe` can read the generated RTSP URL.
- A browser-viewable HLS URL is printed.
- eldercare-fall-ai has no checked-in RTSP publishing script or `dev:rtsp`
  command.
- `ml-worker-nursing-home-backend-e2e.sh` requires a provided RTSP URL instead
  of generating one.
