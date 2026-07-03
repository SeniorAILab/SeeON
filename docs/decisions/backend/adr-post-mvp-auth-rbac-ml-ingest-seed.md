# ADR: Post-MVP auth, RBAC, ML ingest, and seed doctrine

## Decision

- Browser auth is stateless cookie-JWT in `app_session`: httpOnly, Secure in production, SameSite=Strict, 12 hour TTL, claims `{ sub, role, facilityId, sessionVersion }`.
- Password users use scrypt verification. Logout/revocation increments `sessionVersion`; there is no `ServerSession` persistence model.
- `GET /api/v1/auth/me` is the current identity bootstrap route. The old session-restore route is removed.
- Facility scope is token-derived for facility users. `SUPER_ADMIN` uses the request-scoped `X-Facility-Id` header after choosing a facility; the header does not mutate the JWT and cannot switch a facility-bound user.
- Facility read surface is `GET /api/v1/facilities` plus `GET /api/v1/facilities/:id`; own/effective facility returns `200`, another facility returns `404`.
- Admin mutations use `RolesGuard` plus `@RequireCapability('facilityAdmin')` on top of JWT/facility guards. The source-derived count at this decision is 20 decorated controller handlers in `backend/src/**/*.controller.ts`.
- Backend accepts ML event type as the canonical input after trim/lowercase normalization. Unknown types return `4xx`. Backend does not re-threshold confidence and does not apply cooldown or hourly-cap suppression at ingress.
- Dashboard realtime emits exactly two normal named, space-keyed SSE frames: `event: alert` and `event: alert-updated`.
- Seed is unified under the canonical Prisma seed path with env-driven credentials. Production must not silently default to `1234`; local/demo passwords come from `NOKYANG_ADMIN_PASSWORD` and related seed environment.

## Drivers

- The delivered post-MVP product needs a small browser-native auth contract without server-side session rows.
- Tenant scope must be explicit, auditable, and safe for both facility-bound users and `SUPER_ADMIN` operators.
- Capability RBAC must protect admin mutation routes without duplicating role checks in controllers.
- ML ingest should preserve the worker's domain classification and leave policy/persistence/delivery ownership in the backend.
- Docs and seeds must not encourage production defaults or stale demo credentials.

## Alternatives considered

- **Server-side session scope model (#450 thesis):** rejected. It was superseded by stateless cookie-JWT plus request-scoped `X-Facility-Id` for `SUPER_ADMIN`.
- **Keep the session-restore route as the frontend bootstrap:** rejected. `GET /api/v1/auth/me` is clearer and matches JWT identity semantics.
- **Backend re-threshold/cooldown/hourly-cap at ingest:** rejected. The backend validates type/camera ownership and records policy-owned alerts, but does not reinterpret ML probability as an acceptance gate.
- **Keep old dashboard status/probe skeletons:** rejected. They were removed instead of carried as compatibility aliases.
- **Keep split or silent-default seed docs:** rejected. Seed credentials must be environment-driven and production-safe.

## Why chosen

Cookie-JWT with `sessionVersion` gives revocation without `ServerSession` storage while preserving simple browser cookie semantics. `GET /api/v1/auth/me` provides a direct identity bootstrap and avoids route ambiguity. `X-Facility-Id` keeps `SUPER_ADMIN` tenant selection request-scoped and prevents accidental persistent tenant mutation.

`RolesGuard` plus `@RequireCapability('facilityAdmin')` makes admin-write authorization declarative at route boundaries. Keeping ML type acceptance as trim/lowercase + allowlist validation avoids duplicated worker policy and keeps unknown signals fail-fast. Unified seed docs prevent insecure production defaults from being normalized.

## Consequences

- Any doc or client still using the old session route must move to `GET /api/v1/auth/me`.
- Removed facility-current/status/probe/skeleton routes must not be reintroduced as compatibility aliases without a new decision.
- Frontend/dashboard code should treat SSE as invalidation keyed by `spaceId`/`alertSeq`, not as a status-snapshot state source.
- Capability-protected admin mutations must stay decorated; the current source count is a regression check, not a hand-maintained constant.
- Seed instructions must name the env-driven password variables and must not document a production fallback of `1234`.

## Follow-ups

- Keep route inventory and dashboard API docs cross-checked against `backend/src/**/*.controller.ts` whenever controllers change.
- Re-run the `@RequireCapability` source count when adding/removing admin mutation handlers.
- Keep #450 recorded as rejected for session scope, with only the production-secrets and seed portions salvaged in #452 and frontend scope dropped as superseded by #451.
- Keep #448 handled as fix-forward signup consent gate in #453.
