---
slug: agents-cicd-deploy-context
author: codex
date: 2026-06-23
status: done
---

# Plan

1. Use `init-deep` discovery to identify only the high-risk child contexts for
   CI/CD and deployment.
2. Add `.github/AGENTS.md` for GitHub workflow governance without restating the
   root repository lifecycle.
3. Add `scripts/deploy/AGENTS.md` for VM deploy script contracts without
   restating GitHub Actions implementation details.
4. Add `backend/prisma/AGENTS.md` for schema, migration, runtime-role, and
   Prisma runtime image boundaries.
5. Add a minimal pointer from `backend/AGENTS.md` to the Prisma child guidance.
6. Validate the added Markdown and confirm no secrets or broad process
   duplication were introduced.
