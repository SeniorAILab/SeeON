---
slug: remove-compose-registry-overlay
author: codex
date: 2026-06-23
---

# Spec

Remove the separate production registry Compose overlay if it is only preserving
an unnecessary distinction between production Compose and registry-image deploy.

Success criteria:

- Production deployment uses `compose.yaml` plus `compose.prod.yaml` only.
- Backend/front production services still use explicit GHCR image references and
  never build on the VM.
- `BACKEND_IMAGE` and `FRONT_IMAGE` remain fail-closed production inputs.
- Existing env/Compose verification covers the simplified two-file production
  path.
- Runbook and scripts no longer mention `compose.registry.yaml`.
