---
slug: remove-visit-planned-staff-action
status: done
author: Codex
date: 2026-07-02
---

# Remove Visit Planned Staff Action

## Goal

Remove the stale `방문 예정` staff action from the focus-resident surface and align it with the active staff action contract: `확인함` / `직원 방문 중` / `도움 요청`.

## Scope

- Update the focus-resident action button type, label, and icon.
- Keep the mobile CJK nowrap/layout fix intact.
- Update the frontend README line that still documents `방문 예정`.
- Do not touch unrelated local `.codex/config.toml`.

## Verification

- Run frontend typecheck and lint.
- Search for stale `방문 예정` usage in active frontend source.
- Commit and push the scoped change into PR #447.
