---
slug: pr-decomposition-and-review-convention
status: done
date: 2026-06-16
author: codex
issue: 110
---

# PR decomposition and review convention

## Goal

Complete the governance portion of #110 after the CI size gate landed in #115:
make the split-PR operating model explicit in repo rules and link it from
AGENTS.md.

## Scope

- Add `docs/rules/pr-decomposition-and-review.md`.
- Add the rule to `docs/rules/README.md`.
- Add the AGENTS.md convention pointer.
- Keep branch-protection changes out of scope; they require repository settings
  authority and were already listed as follow-up in #110.

## Verification

- Markdown/rule links resolve locally.
- Diff contains docs/governance files only.
- PR size remains `size/M` or smaller.
