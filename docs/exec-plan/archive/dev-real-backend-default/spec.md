---
slug: dev-real-backend-default
status: done
date: 2026-06-23
author: codex
---

# Spec

## Goal

Make the frontend's default development runtime use the real backend path instead of the in-browser mock path now that the local dev infrastructure exists.

## Requirements

- `VITE_USE_MOCK` must default to real backend mode when unset.
- Mock mode remains available only by explicitly setting `VITE_USE_MOCK=true`.
- Local env examples and agent guidance must document real backend as the default.
- Existing mock-focused tests must keep running by explicitly selecting mock mode in the test environment.

## Non-goals

- Do not rewrite service implementations from mock data to backend endpoints in this slice.
- Do not remove the mock runtime.
- Do not change production deploy behavior; it already builds with `VITE_USE_MOCK=false`.
