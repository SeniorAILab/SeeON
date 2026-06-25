# ADR-069: Dual Auth Login With One Backend Session Model

## Status

Accepted.

## Date

2026-06-23

## Context

The frontend had a useful login frame with email/password and Kakao entry points, but dev/prod auth was temporarily narrowed to Kakao-only to remove mock frontend sessions. That solved the mock-auth risk but created the wrong product boundary: facility admins and staff need a standard manual login path, while Kakao remains the OAuth/social entry point and the Kakao Talk consent path.

OAuth best practice still applies to Kakao: browser redirect, authorization code exchange on the backend, redirect URI registration, no Kakao tokens in the browser. Standard password login also needs the backend to validate credentials and mint the authenticated session. The common part is not the credential mechanism; it is the backend-owned session.

## Decision

Support two browser login mechanisms in dev/prod:

- `POST /auth/login` for email/password.
- `GET /auth/kakao/login` plus `GET /auth/kakao/callback` for Kakao OAuth.

Both mechanisms mint the same backend-owned `app_session` httpOnly cookie and `ServerSession` record defined by ADR-033. The frontend restores identity only through `GET /auth/session`; it must not store auth sessions in localStorage or carry mock auth users in real backend mode.

The `User` record allows either credential family:

- `email` is optional and unique when present.
- `passwordHash` is optional and present only for password-login users.
- `kakaoId` is optional and unique when present.
- A user can later have both email/password and Kakao identity, but neither the browser nor frontend state owns that link.

Local seed data may create known email-login users for development. That is backend seed data, not a frontend mock login surface.

## Consequences

- Kakao-only documentation and frontend assumptions are superseded by this ADR.
- Password hashing stays in the backend; password hashes are never returned by auth responses.
- Kakao tokens remain backend-only and follow ADR-033/ADR-042/ADR-051.
- Staff-mode users can log in with email/password when seeded or provisioned by backend/admin workflows.

## Follow-ups

- Add a proper admin user-provisioning workflow before relying on manual SQL/seed users outside local development.
- Decide whether account linking between email users and Kakao identities needs an explicit UX and audit event.
