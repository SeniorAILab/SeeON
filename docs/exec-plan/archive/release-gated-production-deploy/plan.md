---
slug: release-gated-production-deploy
author: codex
date: 2026-06-23
status: done
---

# Plan

1. Use official GitHub Actions docs to confirm release/manual triggers, private
   repo billing constraints, and environment availability limits.
2. Replace the `workflow_run` deploy trigger with `release.published` plus
   `workflow_dispatch`.
3. Resolve the deployed commit SHA after checkout so GHCR image tags remain
   exact and immutable enough for operations.
4. Update deployment runbook, `.github/AGENTS.md`, and ADRs to record that
   `main` merge is not production deploy.
5. Verify workflow syntax-adjacent checks, env contract, PR checks, package
   cleanup, and public site access before merge.
