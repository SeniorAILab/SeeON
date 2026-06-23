---
slug: release-gated-production-deploy
author: codex
date: 2026-06-23
---

# Spec

Change Naver Cloud production deployment from "every successful main CI run" to
"explicit release or operator dispatch" so a GitHub Free private repository does
not spend Actions minutes on unintended production deploys.

Success criteria:

- Merging to `main` runs CI but does not start production deployment.
- Publishing a non-prerelease GitHub Release starts the production deploy
  workflow.
- Manual dispatch remains available for an explicit `ref`.
- Deploy images are still built in GitHub Actions and deployed by exact commit
  SHA image tag.
- Runbook and AGENTS guidance reflect the release-gated policy.
