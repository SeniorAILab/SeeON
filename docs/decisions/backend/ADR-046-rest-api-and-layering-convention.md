# ADR-046: REST API and layering convention

## Status

Accepted

## Date

2026-06-18

## Context

The backend exposes a mix of product REST paths, auth paths, ingest paths, and historical pilot paths. Without one convention, new endpoints can drift toward dotted controller prefixes, controller-owned business logic, DTOs embedded in domain services, or transport-shaped domain objects.

The project already keeps mechanical rules in `docs/rules/` and architectural decisions in ADRs. This ADR records the backend convention that implementation slices must follow while `docs/` remains the source of truth for front/backend/ML contracts.

## Decision

Use REST-shaped HTTP paths and explicit NestJS layering for backend API work.

Concretely:

- Public product API routes use slash-separated REST paths such as `/api/alerts`, `/api/alerts/:id/ack`, `/api/cameras`, `/api/residents`, `/api/guardians`, `/api/status`, and `/api/sse`.
- Auth/session routes remain under `/auth/...` when they are authentication concerns rather than product resources.
- Machine ingest routes remain under `/ingest/...`; alert ingestion is governed by ADR-043 and ADR-047.
- Dotted route prefixes such as `/api.alerts/...` are not used for new live API contracts.
- Controllers are transport adapters: parse route/query/body DTOs, call an application/service boundary, and return presenter/output DTOs.
- Services own use-case orchestration, domain policy, transaction boundaries, and calls to ports.
- Repositories own persistence queries and Prisma mapping details.
- DTOs own HTTP input/output shape and validation; they must not become persistence models or domain-policy containers.
- Adapters implement external system ports such as ML serving, Kakao, or other providers.
- Presenters/output mappers convert domain/application results into stable HTTP response bodies.
- Rule documents under `docs/rules/` can carry mechanical review details, but must not contradict the API and layering ownership recorded here.

## Alternatives Considered

### Keep controller-local conventions

- Pros: lowest immediate ceremony for small endpoints.
- Cons: repeats route and layering decisions in every controller and makes contract drift hard to review.
- Rejected: the refactor needs one documented convention that code, docs, and reviewers can share.

### Use dotted backend route namespaces for domain grouping

- Pros: visibly separates pilot or internal routes from product REST resources.
- Cons: conflicts with normal REST path expectations and front/backend contract documentation.
- Rejected: slash-separated resource paths are the canonical live API style.

### Put all backend layers in global folders

- Pros: uniform physical structure.
- Cons: encourages abstraction before a domain seam exists and conflicts with existing bounded module patterns.
- Rejected: layering is required by responsibility, not by speculative global folder shape.

## Consequences

- New backend API work has a single route and layering convention.
- Historical pilot endpoints must be removed, repositioned, or explicitly superseded instead of copied.
- Code review can reject controller-owned policy, repository-owned transport DTOs, and adapter leakage into route handlers.
- Rule documents can stay mechanical and concise because this ADR owns the architectural convention.
