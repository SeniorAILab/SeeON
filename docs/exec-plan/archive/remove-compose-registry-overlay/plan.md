---
slug: remove-compose-registry-overlay
author: codex
date: 2026-06-23
status: done
---

# Plan

1. Confirm the current registry overlay behavior with the env/Compose contract
   check.
2. Move registry image and pull policy settings into `compose.prod.yaml`.
3. Delete `compose.registry.yaml` and remove references from GitHub Actions,
   deploy scripts, runbooks, and env verification.
4. Update production env examples and npm scripts so prod Compose is pull/run,
   not build.
5. Re-run env verification, shell syntax checks, and PR checks.
