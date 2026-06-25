---
slug: kakao-cookie-session-api-auth
status: done
created: 2026-06-23
owner: codex
---

# Kakao Cookie Session API Auth

## Context

Kakao OAuth is implemented as a backend-owned token exchange: the browser is redirected to Kakao, the backend exchanges the authorization code for Kakao tokens, stores the Kakao access token server-side, and sets an HttpOnly application session cookie. The browser should not receive a Kakao access token.

The suspected frontend gap is after the callback: shared frontend API requests do not currently opt into sending cookies when `VITE_USE_MOCK=false`, so a real Kakao login can produce a valid session cookie while later protected API calls still look unauthenticated.

## Plan

1. Add a focused frontend regression test proving real-mode `request()` sends cookies for backend session auth.
2. Run the new test first and capture the failure.
3. Change only the shared API client credential default needed for real backend mode.
4. Run the focused test, then the affected frontend suite, typecheck, and lint.
5. Record the remaining real-Kakao manual QA gap if local Kakao credentials/backend are unavailable.

## Acceptance

- In `VITE_USE_MOCK=false`, `request()` calls `fetch` with `credentials: "include"` unless a caller explicitly overrides credentials.
- Existing bearer-token mock behavior remains intact.
- Frontend tests/typecheck/lint pass.
