---
slug: documents-skill-craft-migration
title: "Documents Skill Craft Migration"
author: codex
date: 2026-06-25
status: done
---

# Documents Skill Craft Migration Plan

## Steps

1. Inspect current project skill mirrors and installed craft-skills `documents`.
2. Fast-forward `/Users/<user>/dev/GoBeromsu/craft-skills` to the current GitHub
   `main` when possible.
3. Remove repo-local `documentation-and-adrs` and its `.claude`/`.codex`
   mirror entries.
4. Do not vendor `documents` into this repo; expose it through user-level skill
   symlinks that point at the craft-skills checkout.
5. Verify skill path, deleted ADR skill state, and git diff.

## Verification

- `git -C /Users/<user>/dev/GoBeromsu/craft-skills rev-parse HEAD` matches
  GitHub `main` for GoBeromsu/craft-skills.
- `readlink /Users/<user>/.claude/skills/documents` and
  `readlink /Users/<user>/.codex/skills/documents` point to the craft-skills
  checkout.
- Repo-local `.agents/skills`, `.claude/skills`, and `.codex/skills` no longer
  contain `documentation-and-adrs` or a vendored `documents` copy.
