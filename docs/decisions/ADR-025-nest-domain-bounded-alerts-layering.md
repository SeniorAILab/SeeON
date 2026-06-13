# ADR-025: Nest domain-bounded layering for alerts

## Status
Accepted

## Date
2026-06-13

## Context

The alert pipeline needs controller, policy/use-case, persistence, and channel-adapter seams. A generic layered architecture copied as repo-wide `controllers/`, `services/`, `repositories/`, and `adapters/` folders would fight Nest conventions and create folder theater. Nest modules are the dependency boundary; providers inside a module should express the domain's use cases and ports.

## Decision

Implement alerting as a domain-bounded `AlertsModule`:

- Controllers stay thin and parse/authenticate the REST contract.
- Services/use-cases own policy orchestration and control flow.
- Repositories isolate Prisma persistence.
- Ports define external side-effect seams such as `ChannelPort`.
- Adapters implement ports, including Kakao send-to-me as a pilot adapter.
- The module reuses the existing global `PrismaModule` instead of creating a separate data layer framework.

## Alternatives Considered

### Global folder-based layered architecture
- Pros: familiar to some layered architecture examples.
- Cons: obscures Nest module/provider boundaries and spreads one domain across unrelated folders.
- Rejected: it creates boilerplate without improving boundary clarity.

### One large `AlertService`
- Pros: smallest initial file count.
- Cons: mixes API parsing, policy, persistence, and provider effects; makes idempotency and channel testing harder.
- Rejected: structural hardening needs testable seams.

### Separate microservice for alerts
- Pros: strong deployment boundary.
- Cons: premature operational complexity for the current monorepo and PoC stage.
- Rejected: Nest module boundary is enough for this slice.

## Consequences

- Alert code lives under `backend/src/alerts/` with internal `controllers/`, `services/`, `repositories/`, `ports/`, and `adapters/` directories.
- Future backend domains may follow the same module-bounded layering when they have real persistence or external-port seams.
- Layering is justified by domain boundaries and side effects, not by global folder naming conventions.
