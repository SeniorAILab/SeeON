# ADR: Wire-contract SSOT is code + generated OpenAPI + contract tests (docs/api removed)

## Decision

- `docs/api/` (hand-maintained HTTP/SSE/ingest contract prose) is removed.
- Backend REST/SSE contract SSOT = the NestJS controllers/DTOs, surfaced as **generated OpenAPI at `/api/docs`** (`@nestjs/swagger`), verified by contract tests. Code is the source of truth; there is nothing to hand-sync.
- Cross-runtime/external contracts (ML serving, edge ingest, Kakao delivery, realtime SSE frames) keep their rationale with the owning code and, when a durable rule is needed, in `docs/rules/` or a decision here — not a duplicated prose page.
- Consumers (e.g. front `alertsApi`) parse per the generated/tested contract and stay **tolerant** (unknown/absent optional fields → ignore/null); a consumer must not be stricter than the contract.

## Drivers

- Hand-maintained contract docs duplicate what the code already owns and inevitably drift; a stale contract doc is worse than none (false confidence). This bit #456: `docs/api` still listed resident/guardian routes and had to be hand-patched.
- Multi-agent / multi-session and front/backend/ml parallel work needs a contract SSOT that cannot silently drift from the code.

## Alternatives considered

- **Keep `docs/api/` as the single-owner SSOT (the #216/PR#217, ADR-022/023/043 convention):** rejected — that is exactly the stale-trap being removed.
- **Delete only the auto-generatable REST pair, relocate the ML/edge/Kakao pages:** considered; rejected for simplicity — all hand-maintained contract prose is removed. ML/edge/Kakao rationale lives with owning code + `docs/rules`/decisions; git history preserves the removed pages if any content must be relocated later.

## Why chosen

Code + generated OpenAPI + contract tests cannot drift from the implementation, and tolerant consumers + contract tests catch producer/consumer mismatches where they actually live. This is what makes front/backend/ml PRs safely independent — the goal that motivated the removal.

## Consequences

- `/api/docs` (dev) is the browsable backend contract; there is no committed prose contract page.
- Any inbound reference to `docs/api/*` must point at code / `/api/docs` / tests instead. Rewired here: root `AGENTS.md` (artifact ontology + Location row), `docs/rules/README.md`, `front/README.md`. Immutable `docs/exec-plan/*` plan bodies are left as historical record.
- Follow-up: keep/add backend response-shape + SSE contract tests and a front tolerant-parse contract test (#458) as the real enforcement layer.

## Where enforced

- Backend: controller/DTO code + `@nestjs/swagger` OpenAPI at `/api/docs`; response/SSE shape specs (`alerts.service.spec`, `sse.controller.spec`).
- Front: `alertsApi` tolerant parse + fixtures (#458).
