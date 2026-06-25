---
slug: login-auth-unified-adr
author: codex
date: 2026-06-25
---

# Login/Auth Unified ADR Spec

## Problem

Login and signup authority is split across multiple backend ADRs and an
operational login ADR. That makes repeated OAuth/login failures hard to triage
and leaves future implementers unsure whether email/password login, Kakao OAuth,
token/session handling, `/auth/session`, and signup/onboarding fields are one
architecture or several local patches.

## Target Outcome

Create one sufficient current backend ADR for login/auth and one
decision-complete implementation plan:

- ADR-071 is the single current login/auth SSOT.
- ADR-033, ADR-042, ADR-051, and ADR-069 are retired from the visible backend
  ADR corpus only after ADR-071 and `docs/decisions/README.md` map their active
  clauses.
- The implementation plan covers frontend/backend login, Kakao OAuth,
  token/session handling, `/auth/session`, and signup fields.

## Scope

- Documentation and planning artifacts only in this planning turn.
- No product-code implementation.
- No frontend/backend schema, route, or UI edits.

## Non-Goals

- Do not implement `POST /auth/register` in this turn.
- Do not change the runtime auth behavior in this turn.
- Do not remove `/auth/session`; this plan keeps it as restore/rotation.
