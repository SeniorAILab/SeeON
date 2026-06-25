---
slug: prod-db-url-migration-runner
author: codex
date: 2026-06-23
status: superseded-by
superseded-by: ncloud-golden-path-cleanup
---

# Plan

1. Change the backend runtime image to include Prisma schema/migrations and the
   Prisma CLI needed for `prisma migrate deploy`.
2. Change the production `migrate` Compose service to use the backend image and
   full production database URLs.
3. Remove `MIGRATE_IMAGE` build/push/pull references from registry overlay,
   deploy script, and GitHub Actions.
4. Update env contract checks and deploy runbook to document encoded
   `DATABASE_URL` and `DIRECT_URL`.
5. Validate Compose rendering, env contract checks, shell syntax, and the
   production deploy workflow.
