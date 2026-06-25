---
slug: login-oauth-operational-ssot
author: codex
date: 2026-06-25
status: done
---

# Login/OAuth Operational SSOT Plan

## Evidence Inputs

- Codebase audit of backend auth/session/Kakao implementation.
- Codebase audit of frontend auth/session restore/proxy implementation.
- Git history audit for auth migration and regression windows.
- Kakao Developers official documentation for redirect URI, Client Secret,
  consent items, message scope, and error signatures.

## Steps

1. Confirm current repo auth surface and failure points.
2. Confirm Kakao operator requirements from first-party documentation.
3. Fix Compose env pass-through for optional Kakao OAuth values that are
   present in env templates but missing from backend container environment.
4. Add `ADR-071` in the backend category as the login/OAuth operational gate.
5. Update `docs/decisions/README.md` backend index.
6. Run markdown/link-oriented verification on touched docs and summarize any
   remaining implementation risk.

## Acceptance Checks

- ADR cites existing repo authority: ADR-033, ADR-042, ADR-051, ADR-069, env
  examples, nginx proxy, and auth code paths.
- ADR records the live site origin `http://<retired-host>`.
- ADR includes a concrete Kakao Developers checklist, including redirect URI,
  Client Secret, `talk_message`, app members/additional feature review limits,
  and expected error codes.
- ADR avoids creating a second auth architecture.
