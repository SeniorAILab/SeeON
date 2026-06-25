---
slug: manual-prod-deploy-command
status: done
date: 2026-06-23
author: codex
---

# Spec

## Goal

Allow an operator to deploy a production release when GitHub Actions minutes are exhausted by building and pushing the same SHA-pinned GHCR images from a local checkout, then running the existing Naver Cloud VM pull-only deploy flow.

## Requirements

- Keep GitHub Release publication as the normal production promotion path.
- Add an explicit manual command for the quota-exhausted path.
- Preserve the VM invariant: the Naver Cloud server never builds application images.
- Preserve fail-fast deployment: no automatic fallback tag, no implicit `latest`, and no automatic retry.
- Build the production frontend with `VITE_USE_MOCK=false` and `/api`.
- Block mock email/password demo login when the frontend is built with `USE_MOCK=false`.
- Document the operator path and its boundaries.

## Non-goals

- Do not add Jenkins or another deploy service.
- Do not change the production Compose topology.
- Do not add a second registry.
- Do not deploy automatically on every merge to `main`.
