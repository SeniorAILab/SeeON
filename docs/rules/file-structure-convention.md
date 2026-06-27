# File structure convention

Backend domains use a consistent Nest module layout. The goal is boring navigation: a future maintainer should know where controller DTOs, use-case services, Prisma access, ports, adapters, and tests belong before opening the tree.

## Domain module layout

Use this shape for each non-trivial domain:

```text
backend/src/<domain>/
  <domain>.module.ts
  controllers/
    *.controller.ts
    *.controller.spec.ts
  services/
    *.service.ts
    *.service.spec.ts
  repositories/
    *.repository.ts
    *.repository.spec.ts
  ports/
    *.port.ts
  adapters/
    *.adapter.ts
    *.adapter.spec.ts
  dto/
    *.dto.ts
```

Small legacy domains may still have flat files during transition (`backend/src/residents/residents.controller.ts`, `backend/src/cameras/cameras.service.ts`, `backend/src/guardians/guardians.controller.ts`). New cross-cutting work should not deepen the flat pattern; move toward the per-domain folder layout when touching those domains for substantive changes.

## Naming

- Controllers: `*.controller.ts`
- Services/use cases: `*.service.ts`
- Repositories: `*.repository.ts`
- DTOs and parser-facing types: `*.dto.ts`
- Ports/interfaces/tokens for outbound contracts: `*.port.ts`
- External-system implementations: `*.adapter.ts`
- Tests: `*.spec.ts`, beside the source file they exercise

Reference layout already present across `backend/src/events/` and `backend/src/alerts/`:

- `backend/src/events/events.controller.ts` stays thin: request DTO parsing and service calls.
- `backend/src/events/events.service.ts`
- `backend/src/events/dto/*.dto.ts`
- `backend/src/alerts/services/alert-events.service.ts`
- `backend/src/alerts/services/alert-policy.service.ts`
- `backend/src/alerts/repositories/alert-events.repository.ts`
- `backend/src/alerts/ports/channel.port.ts`
- `backend/src/alerts/ports/prediction.port.ts`
- `backend/src/alerts/adapters/kakao-send-to-me-channel.adapter.ts`
- `backend/src/alerts/adapters/ml-serving-prediction.adapter.ts`
- `backend/src/alerts/dto/alert-events.dto.ts`

## No root contracts folder

Do not create a root `contracts/` folder. Standing contracts and conventions live under `docs/`:

- `docs/rules/` for coding and API conventions.
- `docs/domain/` for domain contracts and glossary.
- `docs/decisions/` for ADRs.
- `docs/exec-plan/` for work-scoped plans/specs.

Code DTOs stay next to their controller/domain under `backend/src/<domain>/dto/`; frontend mappers stay in the relevant frontend domain/lib folder.

## Tests beside source

Focused tests live beside the unit they exercise, not in a separate root test hierarchy unless they are true app/e2e boot tests.

Examples:

- `backend/src/alerts/adapters/ml-serving-prediction.adapter.spec.ts` beside `ml-serving-prediction.adapter.ts`.
- `backend/src/alerts/repositories/alert-events.repository.spec.ts` beside the repository.
- `backend/src/events/events.service.spec.ts` beside `events.service.ts`; controller specs stay beside thin controllers when they exercise HTTP wiring.
- `backend/test/auth.spec.ts` and `backend/test/app-boot.spec.ts` are acceptable because they exercise whole-app route/session boot behavior rather than one source unit.
