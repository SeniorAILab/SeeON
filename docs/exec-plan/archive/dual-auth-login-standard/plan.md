---
slug: dual-auth-login-standard
status: done
date: 2026-06-23
author: codex
---

# Plan

1. Add backend schema support for nullable Kakao IDs and password hashes.
2. Add backend password hashing plus `POST /auth/login` that issues the existing session cookie.
3. Restore frontend email/password login against the backend endpoint while keeping Kakao OAuth.
4. Update tests and docs so both auth paths are pinned as real backend paths.
5. Run backend/frontend tests, typecheck/build, browser UI QA, then archive this plan.
