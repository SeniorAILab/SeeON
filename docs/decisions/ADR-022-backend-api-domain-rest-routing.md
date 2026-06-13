# ADR-022: Backend API domain prefix plus REST resource routing

## Status

Accepted

## Date

2026-06-13

## Context

ADR-001 defines `backend/` as the NestJS API server that owns alert policy,
webhook dispatch, and persistence. ADR-003 further states that ML returns
predictions only while product-level decisions and notifications live in the
backend.

As backend domains grow, route names need to expose ownership without turning
resource paths into implementation-specific controller names. The project needs
one route convention before alerting, detection events, and future dashboard
APIs start depending on public URLs.

## Decision

Backend HTTP APIs use a domain-prefixed path segment:

```text
/api.<domain>/<rest-resource-path>
```

`api.<domain>` is a URL path segment, not a DNS subdomain. The domain name is
the Nest domain module owner, in kebab-case or plural noun form when that is the
domain's natural name.

After the domain prefix, paths follow REST resource rules:

- Use plural nouns for resources.
- Avoid verbs in path segments.
- Use HTTP methods for actions: `GET`, `POST`, `PATCH`, `DELETE`.
- Use nested resources when ownership is structural.
- Keep request and response DTOs under the owning domain module.

The alerts domain must not expose a backend HTTP endpoint that returns raw Kakao
authorize URLs or `client_id` values. Kakao OAuth operator authorization is
handled by the local CLI/browser flow only. Token exchange and notification
dispatch use the same prefix and resource-style routing only when they are safe
to expose over HTTP.

Alert event ingress uses:

```text
POST /api.alerts/events
```

During the W1-W3 Kakao fall-alert pilot, root `POST /events` is temporarily
preserved as a backcompat alias for existing ML/demo pilot callers. New callers
must use `POST /api.alerts/events`; the alias should be removed after pilot
clients and evidence harnesses no longer depend on it.

## Alternatives Considered

### `/api/<domain>/...`

This is the most common REST prefix. Rejected for this project because the
domain marker blends into ordinary resources and makes route ownership less
visible in logs, tests, and frontend API clients.

### `/api/v1/<domain>/...`

Rejected for now. The project follows the one-version rule: extend contracts
additively rather than creating parallel API versions before there are external
consumers.

### Backend authorization URL endpoints

Examples: `/api.alerts/kakao/oauth/authorization-urls`,
`/api.alerts/kakao/oauth/authorize`.

Rejected. No backend HTTP endpoint should return raw Kakao authorize URLs or
`client_id` values; the pilot uses the CLI/browser local flow for operator
authorization.

### DNS subdomains per domain

Example: `https://api.alerts.example.com/...`.

Rejected. That would add deployment, cookie, CORS, TLS, and local-development
complexity without improving the current monorepo API boundary. `api.<domain>`
is a path convention only.

## Consequences

- Logs and tests make domain ownership visible at the first path segment.
- Frontend clients can group calls by backend domain without knowing Nest file
  layout.
- Domain modules own their controllers, DTOs, and service contracts together.
- If an API becomes externally consumed and needs a breaking change, a later ADR
  must define the migration/versioning strategy rather than silently changing
  existing paths.
