---
slug: pr-size-l-hard-reject
title: Hard reject PRs from size L
status: done
author: codex
created: 2026-06-16
---

# Hard reject PRs from size L

## Goal

Update the PR Check workflow so PRs labelled `size/L` or `size/XL` fail the Size Check job instead of only receiving a soft warning.

## Constraints

- Keep existing size labels: `size/S`, `size/M`, `size/L`, `size/XL`.
- Preserve label/comment behavior for same-repo PRs.
- Preserve fork-safe behavior where write operations are skipped.
- Do not change base-branch or draft checks.

## Verification

- Inspect `.github/workflows/pr-check.yml` for `churn > 500` hard-fail threshold.
- Run a local JavaScript syntax check on the embedded `github-script` body.
