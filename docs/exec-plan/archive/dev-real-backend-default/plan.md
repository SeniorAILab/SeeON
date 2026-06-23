---
slug: dev-real-backend-default
status: done
date: 2026-06-23
author: codex
---

# Plan

1. Change `front/src/services/apiClient.ts` so an unset `VITE_USE_MOCK` means real backend mode.
2. Update `.env.local.example` and frontend guidance/docs to show `VITE_USE_MOCK=false` as the local default and `true` as explicit mock mode.
3. Add or update tests that pin the unset-env default and the explicit mock override.
4. Run focused frontend tests, lint/typecheck/build, then commit and push to the existing PR branch.
