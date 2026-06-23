---
slug: backend-direct-login-flow
status: done
date: 2026-06-23
author: codex
---

# Plan

1. Add tests for backend-direct login/onboarding behavior before changing implementation.
2. Remove demo email/password login from `LoginPage` and auth store surface.
3. Add a frontend onboarding endpoint mapper and route/page for `POST /api/facilities`.
4. Update auth tests/docs to reflect backend-direct dev/prod login.
5. Run focused frontend tests, lint, typecheck, build, then archive this plan and push the PR update.
