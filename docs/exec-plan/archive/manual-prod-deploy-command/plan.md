---
slug: manual-prod-deploy-command
status: done
date: 2026-06-23
author: codex
---

# Plan

1. Add a local manual production deploy script that resolves an explicit git ref to a commit SHA, builds/pushes backend and frontend GHCR images under that SHA, uploads the existing deploy bundle, and invokes the VM deploy script with `IMAGE_TAG=<sha>`.
2. Expose the script through a root package command and document dry-run usage.
3. Update runbook/ADR/agent guidance to state the normal release path and quota-exhaustion manual path without weakening the no-server-build and no-fallback rules.
4. Gate frontend email/password mock login behind `USE_MOCK`; production builds should show Kakao login only and service-level mock password login should reject.
5. Add focused tests and run the smallest relevant verification commands.
6. Commit, push, and open a PR for review; do not merge while GitHub Actions quota/checks are unavailable.
