---
slug: login-auth-unified-adr
author: codex
date: 2026-06-25
status: done
---

# Login/Auth Unified ADR Plan

## Decisions

- ADR-071 becomes the single current login/auth ADR.
- Retire visible auth-source ADRs only after coverage proof:
  - ADR-033 Kakao OAuth auth boundary
  - ADR-042 Kakao token encrypted storage
  - ADR-051 Kakao OAuth scope minimal permission
  - ADR-069 dual auth session model
- Keep `/auth/session` as a minimal backend session restore/rotation endpoint.
- Keep backend-owned httpOnly `app_session` cookies. Do not expose bearer tokens
  to frontend code.
- Plan signup as email/password plus required phone/contact data, name, and
  facility name.

## Steps

1. Expand ADR-071 from an operational gate into the full login/auth SSOT.
2. Add an ADR-071 clause coverage matrix for ADR-033, ADR-042, ADR-051, and
   ADR-069.
3. Update `docs/decisions/README.md` so retired auth source ADRs are mapped to
   ADR-071 and excluded from active visible backend ADRs.
4. Remove the old auth ADR source files from `docs/decisions/backend/` after
   README coverage exists.
5. Keep `.omo/plans/login-auth-unified-adr.md` as the downstream
   implementation plan for product-code work.
6. Verify that no live doc links point to retired auth ADR files and that
   current auth/login references resolve to ADR-071.

## Acceptance Checks

- `docs/decisions/README.md` covers OAuth,
  password login, signup, session/token handling, `/auth/session`, and Kakao
  operations.
- `docs/decisions/README.md` maps retired auth source ADRs to ADR-071.
- `docs/decisions/backend/ADR-033-*`, `ADR-042-*`, `ADR-051-*`, and `ADR-069-*`
  are no longer present in the visible backend folder.
- `.omo/plans/login-auth-unified-adr.md` remains decision-complete for the
  frontend/backend implementation phase.
