---
slug: prod-db-url-migration-runner
author: codex
date: 2026-06-23
---

# Spec

Production deploy on the 10 GB Naver Cloud VM should not require a separate
large migration image, and Prisma database URLs must remain valid when database
passwords contain URL-reserved characters.

## Requirements

- Keep GitHub Actions as the image build/push surface.
- Keep the VM deploy path as image pull plus Docker Compose.
- Remove the dedicated GHCR `migrate` image.
- Reuse the backend image for the one-shot Prisma migration container.
- Require full `DATABASE_URL` and `DIRECT_URL` values in production so secrets
  can be URL-encoded before Compose interpolation.
- Do not reintroduce published backend, database, or configurable frontend host
  ports in production.

## Acceptance

- Production Compose config renders with only host port `80` published.
- Registry deploy no longer requires `MIGRATE_IMAGE`.
- The deploy workflow builds and pushes backend and front images only.
- Server/GitHub production env includes encoded `DATABASE_URL` and `DIRECT_URL`.
