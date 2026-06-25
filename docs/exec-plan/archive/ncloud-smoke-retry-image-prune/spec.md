---
slug: ncloud-smoke-retry-image-prune
author: codex
date: 2026-06-23
---

# Spec

The Naver Cloud deploy should not fail when nginx accepts connections a few
seconds before it can serve the first request, and the 10 GB VM should not keep
old GHCR app images after a successful deploy.

## Requirements

- Retry the local HTTP smoke check before failing the deploy.
- Remove unused `ghcr.io/goberomsu/eldercare-fall-ai/*` images after a
  successful deploy.
- Never remove images used by running containers.
- Keep Postgres images, volumes, and running containers untouched.

## Acceptance

- Deploy script succeeds if `http://127.0.0.1/` becomes healthy within the retry
  window.
- Old app image tags, including the retired `migrate` image, are pruned only
  after successful smoke.
