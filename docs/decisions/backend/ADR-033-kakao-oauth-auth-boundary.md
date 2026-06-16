# ADR-033: Kakao OAuth Authentication Boundary — Backend-Owned Callback, Single httpOnly Session JWT

## Status

Accepted

## Date

2026-06-13

## Context

The platform authenticates facility staff via Kakao OAuth 2.0. Three questions had to be resolved:

1. **Who owns the OAuth callback?** — the Next.js frontend (Option A / NextAuth pattern) or the
   NestJS backend (Option B).
2. **How is the authenticated session represented and where is it stored?** — JWT in a cookie, a
   backend session record, or a client-accessible token.
3. **How many browser-facing origins are there?** — a separate front origin and backend origin, or
   a single front origin with backend reached only via Next.js rewrites.

The plan consensus trace (ralplan `2026-06-13-1528-f2cf`) evaluated these as a single bundled
decision because the answers are tightly coupled: cookie origin, SSE authentication, and revocation
semantics all change together depending on who owns the callback.

Architect flagged the dual-origin cookie model (F1) as a HIGH-severity concern before execution
approval.

## Decision

### 1. Backend-owned OAuth callback (Option B)

The NestJS backend owns the Kakao OAuth flow:

- `GET /auth/kakao/login` — redirects the browser to Kakao's authorization endpoint.
  The `redirect_uri` is registered on the **frontend origin** so Kakao returns the code to
  the front; the front has a thin `/auth/kakao/callback` Next.js route that immediately forwards
  the code to the backend via a server-side POST.
- `POST /auth/kakao/callback` (or `GET /auth/kakao/callback` if redirect_uri points directly to
  backend via Next rewrite) — backend exchanges the code for a Kakao access token, upserts
  `User` + `KakaoIdentity`, mints the session JWT, creates a `ServerSession` record, and sets
  the session cookie.
- Identity is owned exclusively by the backend. The frontend never handles Kakao tokens.

### 2. Single httpOnly session JWT in a cookie

The authenticated session is represented as a **short-TTL signed JWT** stored in a single
`app_session` cookie:

```
name:       app_session
httpOnly:   true
Secure:     true (production)
SameSite:   Lax
Path:       /
Domain:     <front origin host>
TTL:        30 minutes (access claim)
```

The JWT payload carries `{ sub: userId, orgId, sessionId, iat, exp }`. `sessionId` is a CUID
that references a `ServerSession` row — revocation checks the server-side record, not just the
JWT signature.

**Rotation**: on any authenticated request within a refresh window (e.g., last 10 minutes before
expiry), the backend mints a new JWT, rotates the `sessionId`, invalidates the prior
`ServerSession`, and sets a new cookie. This gives sliding session semantics without storing a
long-lived refresh token in the browser.

**Revocation**: `DELETE /auth/logout` sets `ServerSession.revokedAt`. Every request validation
(session guard) checks that `ServerSession.revokedAt IS NULL` — logout produces real revocation,
not just cookie deletion. SSE streams re-validate the session record on each keep-alive tick; a
revoked session causes the stream to be closed server-side within one tick.

**No access/refresh tokens stored**: Kakao's access/refresh tokens are not persisted this build
(scope limited to profile + account). Only `KakaoIdentity.kakaoId` is stored.

### 3. Single browser-facing origin via Next.js rewrites and route handlers

The browser communicates with **one origin only**: the Next.js frontend. Backend APIs are not
directly browser-reachable. `next.config.ts` rewrites ordinary backend routes, and the production
SSE stream is owned by a Next App Router route handler that proxies to the backend stream:

```
/auth/*      → http://backend:3000/auth/*
/api/*       → http://backend:3000/api/* for REST routes
/api/sse     → front/src/app/api/sse/route.ts → http://backend:3000/api/sse
/orgs        → http://backend:3000/orgs
/sse         → http://backend:3000/sse (auth/session probe only, not the alert stream)
```

This makes the `app_session` cookie a **first-party cookie** for browser fetch calls and for
`EventSource('/api/sse')` — no cross-origin credential dance, no `SameSite=None`, no CORS
credentials configuration needed in the browser.

The Kakao `redirect_uri` is registered as a front-origin path (e.g.,
`https://front.example.com/auth/kakao/callback`), and the front route immediately delegates
to the backend via the same rewrite — Kakao never needs to know the backend's internal address.

### 4. No NextAuth

NextAuth (Auth.js) is explicitly not adopted. See Alternatives Considered.

## Decision Drivers

- **D1 — Single identity owner**: one service owns token exchange, session minting, and
  revocation. Splitting identity logic between frontend and backend creates ambiguity about which
  record is authoritative.
- **D2 — Cookie first-party requirement**: SSE via `EventSource` does not support the
  `Authorization` header; session must be a cookie. A cross-origin cookie requires `SameSite=None`
  + CORS `credentials: true`, which opens the cookie to third-party contexts. A single
  browser-facing origin avoids this entirely.
- **D3 — Real revocation**: cookie deletion alone is not revocation (the JWT remains valid until
  expiry if intercepted). A server-side `ServerSession` record makes logout semantically real.
- **D4 — Reusability**: the same `ServerSession` infrastructure will serve the future camera
  ingest dispatch token (#96) without architectural change.
- **D5 — Lifecycle clarity**: token TTL, rotation window, and SSE re-auth tick are
  all owned in one place (session guard + interceptor) with no split between frontend and backend
  lifecycle logic.

## Alternatives Considered

### NextAuth (Auth.js) with front-owned session (Option A)

NextAuth running in the Next.js server handles the OAuth callback, stores a session in a
frontend-managed cookie, and exposes `getSession()` / `useSession()` to the frontend.

- Pros: batteries-included OAuth library; minimal backend auth code; well-documented Kakao provider
  or custom provider.
- Cons:
  - **Cross-origin SSE credential problem**: `EventSource` on the browser sends cookies for its
    own origin only. If the backend is a separate origin, the session cookie is not sent on SSE
    connections. Workaround options (forwarding a token in the URL query string, or exposing the
    session as a non-httpOnly value) reduce security properties.
  - **Split token lifecycle**: NextAuth manages the session on the front; the backend must either
    accept the NextAuth JWT (coupling backend validation to NextAuth's signing key and format) or
    run its own parallel session — two identity records for one login event.
  - **Revocation gap**: NextAuth's default JWT sessions do not support server-side revocation
    without a database adapter, and the adapter pattern adds complexity that duplicates what the
    backend `ServerSession` model already needs for RLS GUC binding.
  - **Future org-scoped operations**: auth-time decisions (which org does this user belong to?)
    and session-time GUC binding are backend concerns; pulling them into a NextAuth callback
    creates an awkward coupling.
- **Rejected**: cross-origin cookie semantics incompatible with cookie-authenticated SSE; split
  token lifecycle contradicts the single-identity-owner principle.

### Long-lived opaque session token (no JWT)

Backend issues an opaque random session token stored in a cookie; every request does a DB lookup.

- Pros: trivially revocable; no JWT parsing overhead.
- Cons: every request hits the DB for session lookup; JWT allows the backend to validate
  signature without a DB round-trip on every request (only revocation check needs DB).
- **Deferred, not rejected**: acceptable at higher scale but not necessary for PoC. The
  `ServerSession` row provides revocation; JWT avoids per-request DB lookups for non-revoked
  sessions.

### Storing Kakao access/refresh tokens

Persist Kakao tokens to enable future Kakao API calls on behalf of the user.

- Pros: enables Kakao messaging API for dispatch (#96) without re-auth.
- Cons: Kakao tokens are credentials — storing them requires encryption at rest, rotation
  handling, and scope auditing. Out of scope for this build; #96 will re-evaluate.
- **Deferred**: not stored this build; `KakaoIdentity` schema includes nullable token fields
  ready for a future migration.

### Dual-origin with CORS `credentials: true`

Expose the backend on a second origin; configure `SameSite=None; Secure` and CORS
`credentials: true` for the backend, so the browser sends the cookie cross-origin.

- Pros: allows front and backend to be deployed independently with arbitrary hostnames.
- Cons: `SameSite=None` makes the cookie a third-party cookie eligible for browser policy
  restrictions (ITP, future SameSite default changes); requires maintaining a CORS allowlist;
  SSE cookie delivery is browser-implementation-dependent for cross-site contexts.
- **Rejected**: the single-origin Next rewrite model is simpler, more secure, and sufficient
  for the deployment topology.

## Consequences

**Positive:**

- The `app_session` cookie is always first-party; no CORS credential configuration required.
- Logout is real revocation: the `ServerSession` record is invalidated server-side; SSE streams
  close within one keep-alive tick.
- Identity logic lives in one NestJS module (`auth/`); frontend has no auth business logic.
- SSE authentication reuses the same session guard without any additional token mechanism.

**Negative / trade-offs:**

- The Next.js rewrite layer is a required infrastructure component; removing it (e.g., exposing
  backend directly to the browser) requires revisiting cookie attributes.
- Backend must validate the `ServerSession` record on every request (revocation check); this is
  one extra DB read per request per revocation-capable path.
- The Kakao `redirect_uri` registration in the Kakao Developer Console must match the front-origin
  path exactly — a misconfiguration produces an OAuth error that is opaque to end users.
- Kakao Developer Console setup is a **human-auth-gated** step (requires Chrome + Kakao login)
  and cannot be automated.

## Follow-ups

- AC4 verification: secrets env-only + fail-fast on boot; cookie attributes tested (`httpOnly`,
  `Secure`, `SameSite=Lax`); logout must cause both subsequent API calls and the live SSE stream
  to be rejected/closed within one session re-validation tick.
- Session TTL and rotation window remain configuration constants. The SSE session re-validation
  interval is currently provided by the `SSE_REAUTH_INTERVAL_MS` injection token (default 20 s in
  `DashboardModule`, overridden in tests); expose it as an env setting when operations need runtime
  tuning without code changes.
- Future #96 (Kakao outbound dispatch): the `ServerSession` model is ready; add Kakao token
  storage in a new migration when dispatch scope is approved.
- Multi-provider auth (if a non-Kakao provider is added): the `KakaoIdentity` pattern
  (one identity row per external provider per user) extends naturally; `auth/` module refactoring
  is an additive change.
