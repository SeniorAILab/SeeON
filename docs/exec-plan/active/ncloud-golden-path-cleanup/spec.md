---
slug: ncloud-golden-path-cleanup
author: codex
date: 2026-06-23
---

# Spec

The Naver Cloud deployment path should document and encode only the working
golden path: GitHub Actions builds GHCR images, then the VM pulls those images
and starts the production compose stack.

## Requirements

- Remove stale or exploratory deployment traces from workflows, compose files,
  scripts, and runbooks.
- Keep only the permissions required for checkout, GHCR image publishing, and
  the SSH deploy step.
- Keep the VM deploy script on image-pull mode by default.
- Do not reintroduce server-side application image builds or a separate migrate
  image.
- Preserve the successful smoke retry and Docker image cleanup behavior.

## Acceptance

- GitHub Actions has a single clear Naver Cloud deployment path.
- Compose registry configuration references only backend and frontend images.
- Runbook examples match the golden path and do not mention retired image names
  or workaround-only switches as normal operation.
- Shell syntax, compose env contract, and workflow syntax checks pass.
