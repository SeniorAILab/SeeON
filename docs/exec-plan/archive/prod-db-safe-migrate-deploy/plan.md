---
slug: prod-db-safe-migrate-deploy
status: done
---

# Production DB Safe Migrate Deploy Plan

## Steps

1. Create/use issue #374 and attach the detached worktree to
   `fix/374-prod-db-safe-migrate-deploy`.
2. Capture RED proof that the current production deploy default is destructive.
3. Package Prisma CLI and `backend/prisma/**` in the backend image without
   changing app startup.
4. Refactor the VM deploy script around `DEPLOY_DB_MODE=migrate` with backup
   validation, deploy lock, baseline, reset-demo, and skip modes.
5. Expose DB mode and allow flags in the local manual deploy wrapper.
6. Update docs, ADRs, and agent guidance.
7. Run targeted checks, package/build checks, full local gates, and stale wording
   audits.
8. Commit verified units, push, open PR, and record review evidence.

## Verification

- RED/GREEN safety checker:
  `.omo/evidence/prod-db-safe-migrate-deploy/red-default-safety.txt` and
  `.omo/evidence/prod-db-safe-migrate-deploy/green-default-safety.txt`.
- Shell/Node syntax checks for deploy scripts.
- Manual deploy dry-run checks for `migrate`, `baseline-existing`, denied gates,
  and `reset-demo`.
- Backend Docker runner proof that Prisma CLI and migration assets are present.
- Docs stale wording and keyword audits.
- `pnpm typecheck`, `pnpm lint`, `pnpm --filter backend test`, and
  `git diff --check`.

## Guardrails

- Do not run live production deploy.
- Keep backend/front running until DB work succeeds in safe modes.
- Preserve demo reset only behind the exact destructive allow flag.
- Record all evidence under `.omo/evidence/prod-db-safe-migrate-deploy/`.
