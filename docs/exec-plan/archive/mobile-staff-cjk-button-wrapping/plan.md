---
slug: mobile-staff-cjk-button-wrapping
status: done
author: Codex frontend-visual-alert
date: 2026-07-02
---

# Mobile Staff CJK Button Wrapping

## Goal

Fix the 375px staff "now" visual blocker where Korean action button labels wrap awkwardly in the Happy Nokyang alert surface.

## Scope

- Keep the fix limited to staff action button layout/classes.
- Preserve the real backend/browser QA path and 202호 alert visibility checks.
- Do not touch `.codex/config.toml`.

## Verification

- Re-capture `staff-now-375.png`.
- Run a real-browser console/page-error check at 375px and assert 202호 alert visibility.
- Update visual QA evidence and team artifacts with the final PASS/REVISE verdict.
