---
slug: documents-skill-craft-migration
title: "Documents Skill Craft Migration"
author: codex
date: 2026-06-25
---

# Documents Skill Craft Migration

## Goal

Replace the repo-local ADR-only documentation skill with the external
GoBeromsu/craft-skills `documents` skill surface before login issue work begins.

## Acceptance

- Repo-local skill discovery no longer exposes `documentation-and-adrs`.
- `documents` is not vendored into `.agents/skills`; it comes from
  `/Users/beomsu/dev/GoBeromsu/craft-skills/skills/documents`.
- Claude and Codex user-level skill discovery can resolve the same craft-skills
  `documents` source.
- Skill path and deleted ADR skill state validate with local filesystem checks.

## Out of Scope

- Login implementation or authentication behavior changes.
- ADR content changes under `docs/decisions/`.
