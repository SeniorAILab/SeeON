---
slug: release-prod-command
date: 2026-06-23
author: codex
status: done
---

# Plan: Release production command

1. Add a small root script that shells out to `gh release create` with an
   explicit tag and default `main` target.
2. Expose it through `pnpm release:prod`.
3. Update README, Naver Cloud deploy runbook, and GitHub automation guidance to
   use the command.
4. Verify script syntax, dry-run behavior, env contract, and git diff hygiene.
