# ADR-071: Login/Auth SSOT — Backend Session, Kakao OAuth, Signup, and Operational Gate

## Status

Accepted

## Date

2026-06-25

## References

- References: ADR-034 SSE realtime transport, ADR-044 send-to-me fan-out, ADR-052 Kakao alert message DTO, ADR-053 registered-user recipients, ADR-055 Vite React frontend SSOT, ADR-060 facility session claim and onboarding.
- Sources: Kakao Login prerequisites, REST API, troubleshooting, security guideline, app settings, and Kakao Talk Message docs:
  - <https://developers.kakao.com/docs/en/kakaologin/prerequisite>
  - <https://developers.kakao.com/docs/en/kakaologin/rest-api>
  - <https://developers.kakao.com/docs/en/kakaologin/trouble-shooting>
  - <https://developers.kakao.com/docs/en/getting-started/security-guideline>
  - <https://developers.kakao.com/docs/ko/app-setting/app>
  - <https://developers.kakao.com/docs/en/kakaotalk-message/common>
  - <https://developers.kakao.com/docs/en/kakaotalk-message/rest-api>

## Context

Login failures kept recurring because the repository had four separate auth decisions: backend-owned Kakao OAuth, encrypted Kakao token storage, minimal Kakao scope, and dual email/password plus Kakao login. That split made it too easy to debug one layer while missing another.

The current frontend is the Vite React app behind nginx, not the old Next.js frontend. The live temporary website is:

```text
http://<retired-host>
```

The product needs two login paths and one backend-owned session model:

- Email/password login for registered users.
- Kakao OAuth login for Kakao-linked users and send-to-me token capture.
- Future/target signup that collects name, facility name, password, phone number, and account identity, then binds the user to a facility.

`/auth/session` is not redundant. It is the frontend's only supported restore point after page reload, OAuth callback, cookie rotation, or logout.

## Decision

ADR-071 is the only current login/auth ADR. Backend auth code, frontend auth flows, Kakao setup, and operational triage must read through this ADR first.

### Backend-Owned Identity Boundary

The backend owns identity, credential validation, OAuth callback handling, session issuance, session validation, and Kakao access-token custody.

The frontend may initiate login and render authenticated state, but it must not:

- Store session tokens in localStorage/sessionStorage.
- Receive Kakao access tokens.
- Treat mock users as real backend-mode auth.
- Mint or validate product sessions.

### Supported Login Mechanisms

Both login mechanisms mint the same backend session:

```text
POST /auth/login
GET  /auth/kakao/login
GET  /auth/kakao/callback
POST /auth/logout
GET  /auth/session
```

`POST /auth/login` validates email/password credentials. Kakao login redirects through Kakao REST OAuth and returns through the backend callback. Both paths create or refresh:

- An `app_session` httpOnly cookie.
- A server-side `ServerSession` row for revocation and rotation.
- A user identity whose tenant scope is represented as `facilityId` after onboarding.

Login itself does not grant facility administration or create a facility owner. Kakao OAuth login maps a Kakao member number to an existing local user only; if no local `kakaoId` link exists, the callback returns to `/login?auth_error=kakao_unregistered` without an `app_session`. `POST /auth/register` is the public owner signup path and creates the initial facility/admin session. `POST /api/facilities` is reserved for already authenticated local users that are explicitly pending facility binding.

### Signup and Onboarding Contract

The target public signup flow is backend-owned and must create the same session model as login:

```text
POST /auth/register
```

The planned request shape is:

```json
{
  "name": "홍길동",
  "email": "owner@example.com",
  "password": "8-plus-character-password",
  "phone": "010-1234-5678",
  "facilityName": "봄수요양원"
}
```

The signup path does not collect `businessRegistrationNumber`. `facilityName` is required because signup creates or binds the initial facility.

Public signup passwords follow the current repository contract:

- Minimum length is 8 Unicode code points for launch usability. This is a deliberate product tradeoff below the current NIST Rev. 4 single-factor 15-character floor; add MFA, breached-password screening, or a later ADR before treating this as the long-term high-assurance policy.
- Maximum length is 128 Unicode code points to allow long passphrases while bounding password-hash work. Do not cap passwords at 16 characters.
- No uppercase/lowercase/digit/special-character composition rule is required.
- Spaces and paste are allowed. The backend validates the submitted password and does not rely on frontend checks.
- The frontend provides inline UX feedback, native `minLength`/`maxLength`, `autocomplete="new-password"`, password confirmation, and show/hide control, but server validation remains authoritative.
- Password confirmation is a UI-only guard. `POST /auth/register` receives one `password` value and must not add `passwordConfirm` to the public API contract.

A previously registered local user without a facility is already authenticated and must complete onboarding with:

```text
POST /api/facilities
```

The onboarding request creates server-side facility scope; clients do not submit `facilityId`.
The onboarding request does not collect `businessRegistrationNumber`; business verification belongs to a later facility settings or verification flow if the product needs it.

### Session and Token Contract

The product session cookie contract is:

```text
name: app_session
httpOnly: true
sameSite: lax
path: /
secure: false only for the temporary HTTP/IP deployment
```

For HTTPS deployments, `AUTH_COOKIE_SECURE=true` is required. For the current temporary public IP deployment, `AUTH_COOKIE_SECURE=false` is required because the origin is plain HTTP.

`GET /auth/session` is required. It validates the cookie, checks server-side session state, and returns the frontend's current user representation. It is the only supported frontend restore/rotation endpoint.

SSE and other cookie-authenticated browser flows rely on the same `app_session` boundary. URL bearer tokens and query-string JWTs are rejected because they leak through logs, history, and referrers.

### Kakao OAuth and Token Custody

The live Kakao flow is:

```text
Browser -> http://<retired-host>/login
Kakao login button -> /auth/kakao/login
Backend -> https://kauth.kakao.com/oauth/authorize
Kakao redirect -> http://<retired-host>/auth/kakao/callback
Backend callback -> app_session cookie -> http://<retired-host>/dashboard or /onboarding
Frontend restore -> GET /auth/session
```

`KAKAO_REST_API_KEY=dev-placeholder-kakao-rest-api-key` is only a repository template sentinel. The backend must not redirect a browser to Kakao with that value as `client_id`; the login entry route returns the user to `/login?auth_error=kakao_unavailable` until a real Kakao REST API key is present. The frontend must show a generic user-facing outage message for this code; operator diagnostics such as REST API key, redirect URI, scope, and client-secret checks belong in logs, deploy gates, runbooks, and this ADR.

For local native development:

```dotenv
FRONT_ORIGIN=http://localhost:3000
KAKAO_REDIRECT_URI=http://localhost:8080/auth/kakao/callback
```

For the current Naver Cloud HTTP/IP deployment:

```dotenv
FRONT_ORIGIN=http://<retired-host>
ALERT_DASHBOARD_URL=http://<retired-host>
KAKAO_REDIRECT_URI=http://<retired-host>/auth/kakao/callback
AUTH_COOKIE_SECURE=false
```

Kakao access tokens are backend-only. Per-user Kakao send-to-me tokens are stored encrypted at rest in `KakaoIdentity.accessTokenCipher` using AES-256-GCM with `KAKAO_TOKEN_ENC_KEY`. The key must decode to exactly 32 bytes. Backend code must never log plaintext Kakao access tokens, client secrets, authorization codes, bearer headers, or URLs containing auth codes.

Refresh-token persistence remains deferred until required by product delivery semantics.

### Kakao Developers Checklist

The Kakao app must be configured before an OAuth failure is treated as an implementation bug:

1. Enable Kakao Login.
2. Use the REST API key for this backend-owned flow.
   - `client_id` in `https://kauth.kakao.com/oauth/authorize` must be the Kakao Developers `[App] > [Platform key] > [REST API key]` value.
   - Never use the JavaScript key, Native app key, Admin key, or the repo placeholder value for this REST OAuth flow.
3. Register the exact REST API redirect URI:
   - local: `http://localhost:8080/auth/kakao/callback`
   - current public site: `http://<retired-host>/auth/kakao/callback`
4. If Client Secret is enabled in Kakao Developers, set `KAKAO_CLIENT_SECRET` in backend runtime env.
5. Configure the `[Access Permission] > [Send Kakao Talk Message]` consent item for `talk_message`.
6. Keep `KAKAO_SCOPES` unset or set to `talk_message` unless another consent item is deliberately approved.
7. Do not require `profile_nickname` by default. It is opt-in only: `KAKAO_SCOPES="talk_message profile_nickname"`.
8. During development/test-app operation, add real test users as Kakao app team members before expecting message delivery beyond the app owner.
9. For friends or broader non-team users, request the additional Kakao Talk Friends/Message feature and complete Kakao review.
10. Do not confuse REST OAuth redirect registration with JavaScript SDK domain registration. This repo's login path uses backend-owned REST OAuth.
11. If Kakao messages contain links to `http://<retired-host>`, register the website domain/product link domain required by the Kakao message product.
12. Treat Kakao test apps as isolated from the original app. Test-app keys, settings, and permissions do not prove the production app is configured.

### Repository Env Checklist

The backend runtime must receive these root-env values:

```dotenv
FRONT_ORIGIN=http://<retired-host>
ALERT_DASHBOARD_URL=http://<retired-host>
KAKAO_REST_API_KEY=<Kakao REST API key>
KAKAO_REDIRECT_URI=http://<retired-host>/auth/kakao/callback
KAKAO_TOKEN_ENC_KEY=<32-byte key, 64 hex chars or base64 decoding to 32 bytes>
SESSION_JWT_SECRET=<at least 32 chars>
AUTH_COOKIE_SECURE=false
# KAKAO_CLIENT_SECRET=<required only when enabled in Kakao Developers>
# KAKAO_SCOPES=talk_message
```

Compose must pass optional `KAKAO_CLIENT_SECRET` and `KAKAO_SCOPES` through to the backend container. Keeping them only in `.env.host.prod` is insufficient.

### Frontend Proxy and Cookie Checklist

The deployed frontend must keep `front/nginx.conf` as the same-origin gateway:

- `/auth/` proxies to backend for Kakao login, callback, session, and logout.
- `/api/` proxies to backend product APIs.
- `/ingest/` proxies edge ingest.

Frontend auth requests must use `credentials: include`.

### Failure Triage

OAuth errors should be triaged in this order:

| Symptom                                                                      | First check                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KOE004`                                                                     | Kakao Login is not enabled.                                                                                                                                                                          |
| `KOE006`                                                                     | `KAKAO_REDIRECT_URI` does not exactly match the REST API key redirect URI registered in Kakao Developers.                                                                                            |
| `KOE008` / `KOE101`                                                          | Wrong key type, typo, or placeholder app key; set backend runtime `KAKAO_REST_API_KEY` to the real REST API key.                                                                                     |
| `KOE010` / `Bad client credentials` / token exchange failure                 | Client Secret is enabled in Kakao Developers but `KAKAO_CLIENT_SECRET` is absent or wrong in backend runtime env.                                                                                    |
| `KOE310`                                                                     | Token exchange used a redirect URI different from the authorization request or registered value.                                                                                                     |
| `invalid_scope`                                                              | Requested scope is not configured/approved in Kakao consent items; return to default `talk_message` unless the additional scope is intentionally approved.                                           |
| Callback succeeds but user is back at `/login?auth_error=kakao_unregistered` | Kakao authentication succeeded, but the Kakao member number is not linked to a local account. Owner users should complete `/signup`; staff users need an admin-created or explicitly linked account. |
| Callback succeeds but user is back at `/login` without `kakao_unregistered`  | Check `Set-Cookie`, `AUTH_COOKIE_SECURE`, `/auth/` proxy, and `GET /auth/session` response shape.                                                                                                    |
| Callback lands on `/onboarding`                                              | Auth succeeded for an existing local user, but the user has no `facilityId` yet. Complete `POST /api/facilities` onboarding or bind the demo user.                                                   |

### Login/Auth Anti-patterns and Lessons Learned

These are recurring failure modes this ADR exists to prevent. They are not separate decisions.

| Anti-pattern / pitfall                                                                  | Why it hurt                                                                                                                                                                                                                                                              | Required correction                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Treating `/auth/session` as duplicative because OAuth and password login already exist. | Login creates a session; `/auth/session` restores and validates the browser session after reload, OAuth callback, cookie rotation, and logout.                                                                                                                           | Keep `/auth/session` as the frontend session restore SSOT.                                                                                                                                                                                                                    |
| Redirecting Kakao OAuth with `dev-placeholder-kakao-rest-api-key`.                      | Kakao returns `KOE101`, and an env/setup issue looks like broken application code.                                                                                                                                                                                       | Treat the placeholder as a config sentinel and return to `/login?auth_error=kakao_unavailable` until the real REST API key is present.                                                                                                                                        |
| Showing Kakao Developers key or redirect diagnostics in the user-facing login page.     | Users cannot fix Kakao app settings, and the message leaks internal integration detail.                                                                                                                                                                                  | Use a generic Kakao unavailable message in the frontend; keep detailed diagnostics in server logs, deploy checks, runbooks, and ADR troubleshooting.                                                                                                                          |
| Requesting broad or habitual Kakao scopes.                                              | Unapproved consent items create `invalid_scope` failures and slow the login loop.                                                                                                                                                                                        | Default to `talk_message`; add another scope only when product need and Kakao approval are explicit.                                                                                                                                                                          |
| Assuming first Kakao login should create any local account.                             | OAuth identifies a Kakao member for the callback transaction; it does not decide whether the service should register a facility owner, staff user, or invite. Silent auto-provisioning mixed login with signup and sent first-time users into the wrong onboarding path. | Kakao login only authenticates existing Kakao-linked local users. Unregistered Kakao accounts return to `/login?auth_error=kakao_unregistered`; owner creation goes through `/signup`, and future Kakao signup/linking must use an explicit signup or account-linking intent. |
| Letting the frontend own tokens or localStorage auth.                                   | Identity ownership splits across layers and exposes bearer/session material to browser state.                                                                                                                                                                            | Backend owns Kakao tokens and the httpOnly `app_session`; frontend restores through `/auth/session`.                                                                                                                                                                          |
| Combining login, signup, and onboarding into one hidden `/login` tab flow.              | The `회원가입` button behaved like a form toggle instead of a routable registration flow, which confused QA and browser state.                                                                                                                                           | Keep `/login` and `/signup` as separate routes; onboarding remains a post-auth facility binding flow.                                                                                                                                                                         |
| Collecting `businessRegistrationNumber` during public signup.                           | It makes first access heavier than the product needs and mixes signup with later facility verification.                                                                                                                                                                  | Public signup collects only name, facility name, phone, email, and password.                                                                                                                                                                                                  |
| Collecting `businessRegistrationNumber` during login/onboarding.                        | It makes a login failure look like a business-registration workflow and asks staff-like users for owner-level facility information.                                                                                                                                      | Login and onboarding collect only the minimum account/facility binding data; business verification is a separate future facility settings flow.                                                                                                                               |
| Relying on frontend password validation as the security boundary.                       | Browser validation is bypassable and inconsistent across clients.                                                                                                                                                                                                        | Frontend validation is UX only; backend enforces the password policy.                                                                                                                                                                                                         |
| Treating `8-16 characters` as the whole password standard.                              | 8 characters is an acceptable minimum for this launch UX, but 16-character maximums block safer passphrases and password managers.                                                                                                                                       | Enforce 8+ characters, allow up to 128 Unicode code points, and do not add composition rules.                                                                                                                                                                                 |
| Letting `AuthService` absorb every signup, facility, and policy responsibility.         | Auth edits become riskier as unrelated responsibilities accumulate in the same service.                                                                                                                                                                                  | Extract focused policy and registration helpers before adding more auth behavior.                                                                                                                                                                                             |

## Consequences

- ADR-071 is the current login/auth SSOT.
- `/auth/session` remains required and must not be removed as "duplicative" of OAuth or email/password login.
- Auth debugging starts with the Kakao console, env, proxy, cookie, and `/auth/session` gate before changing backend auth code.
- The current public IP deployment is explicitly supported as a temporary HTTP deployment with `AUTH_COOKIE_SECURE=false`.
- `profile_nickname` is not a default requirement. `talk_message` is the minimal default scope for login plus send-to-me token capture.
- Signup implementation must use `POST /auth/register`, create the same backend-owned session model, and collect name, facility name, password, phone number, and account identity. Password validation must follow the public signup password contract above.
- Kakao OAuth callback must not create local users or facility authority by default; it only logs in existing Kakao-linked local users.
- `KAKAO_CLIENT_SECRET` and `KAKAO_SCOPES` must be present in Compose backend environment pass-through so deployed containers match root env files.

## Verification

Before accepting a login failure as an implementation bug, run:

```bash
pnpm env:verify
pnpm --filter backend test -- src/auth
pnpm --filter front test -- auth
```

With root env loaded and Postgres available, also run the DB-backed auth e2e suite:

```bash
pnpm --filter backend test -- auth
```

Then manually verify:

1. `http://<retired-host>/auth/kakao/login` redirects to Kakao with `redirect_uri=http://<retired-host>/auth/kakao/callback`.
2. Kakao Developers has the same redirect URI under the REST API key.
3. Callback response sets `app_session` only for an existing Kakao-linked local user.
4. `GET http://<retired-host>/auth/session` returns `{ user }` with cookies.
5. An unlinked Kakao user returns to `/login?auth_error=kakao_unregistered`; a facility-bound admin reaches `/dashboard`; a facility-bound staff user reaches `/now`.

## Changelog

- 2026-06-25: Consolidated login/auth into this single current ADR (in-place; git holds the prior separate-ADR history).
- 2026-06-25: Recorded login/auth anti-patterns from the PR-376 implementation loop, including Kakao placeholder handling, session restore, role defaults, signup fields, and password validation boundaries.
- 2026-06-25: Lowered public signup password minimum from 15 to 8 Unicode code points for launch UX while preserving 128-character maximum support for passphrases.
- 2026-06-25: Changed Kakao config failure handling to expose only a generic user-facing unavailable state while retaining operator diagnostics in backend/docs surfaces.
- 2026-06-25: Stopped treating first Kakao login as local account creation; unlinked Kakao accounts now return to signup/staff-registration guidance without a session.
