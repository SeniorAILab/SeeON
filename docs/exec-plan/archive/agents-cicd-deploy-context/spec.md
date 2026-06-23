---
slug: agents-cicd-deploy-context
author: codex
date: 2026-06-23
---

# Spec

Add narrow hierarchical `AGENTS.md` guidance for the CI/CD deployment path so
future agents keep the Naver Cloud golden path intact.

Success criteria:

- `.github/**` edits see workflow-specific guidance about explicit image tags,
  CI-gated deployment, secret handling, and fail-fast behavior.
- `scripts/deploy/**` edits see VM deploy script guidance about pull-and-run
  deploys, no implicit fallbacks, and manual retry policy.
- `backend/prisma/**` edits see the database ownership boundary: schema and
  migrations are committed source, while production replay belongs to deploy
  tooling, not backend app startup.
- Existing root/backend/frontend/ML `AGENTS.md` content is not duplicated.
