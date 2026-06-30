# Rule: Code Stability — Deny-List

**Scope:** repo-wide (`ml/`, `backend/`, `front/`).
**Records:** decision map (fail-fast error policy).
**Grounding:** `docs/research/code-stability-enforcement-practices.md` — verified enforcement
standards (NASA/JPL Power of Ten Rules 5/7, TigerBeetle Tiger Style) are deny-lists of
mechanically checkable violations, not advisory prose. Every rule below maps to a lint rule ID
or a grep-able pattern; a rule a reviewer cannot decide yes/no is not a rule.

## Principle

**Silent continuation is not error handling.** When code cannot do its job, it refuses loudly
(typed exception, failed build, crashed worker) instead of returning a plausible-looking value.
A fake fallback — a default, a mock, an empty result standing in for a failure — converts a
visible bug into an invisible one. In a fall-detection system, invisible failure means a missed
fall.

## Deny-list — Python (`ml/`, enforced by ruff)

| # | Forbidden | Lint rule | Refuse instead |
|---|-----------|-----------|----------------|
| P1 | `except: pass` / `except: continue` | `S110` / `S112` | Handle the specific exception, or let it propagate |
| P2 | bare `except:` | `E722` | Catch the narrowest exception type that you can handle |
| P3 | `except Exception:` outside a process boundary | `BLE001` | Same as P2; boundary exemption below |
| P4 | re-raise inside `except` without `from err` | `B904` | `raise NewError(...) from err` — never lose the cause |
| P5 | `raise Exception(...)` / `raise BaseException(...)` | `TRY002` | Raise a domain-specific exception type |
| P6 | `logging.error` inside an exception handler | `TRY400` | `logging.exception` — the traceback is the point |
| P7 | mutable default arguments | `B006` | `None` sentinel + explicit construction |

**Process-boundary exemption (the only legal broad catch):** a top-level loop that must outlive
one bad iteration (per-frame inference loop, request handler) may catch `Exception` **iff** it
(a) sits at the process/worker boundary, (b) calls `logging.exception`, and (c) carries
`# noqa: BLE001` with a one-line justification. A broad catch that returns a default value
instead of logging-and-continuing is still P1 in spirit and gets rejected in review.

## Deny-list — TypeScript (`backend/`, enforced by typescript-eslint + tsc)

| # | Forbidden | Enforced by | Refuse instead |
|---|-----------|-------------|----------------|
| T1 | un-awaited / un-handled Promise | `no-floating-promises` (error) | `await`, `.catch`, or explicit `void` with justification |
| T2 | empty `catch {}` | `no-empty` | Handle or rethrow; never swallow |
| T3 | `throw "string"` / non-Error rejection | `only-throw-error`, `prefer-promise-reject-errors` | Throw/reject typed `Error` subclasses |
| T4 | non-exhaustive `switch` on union/enum | `switch-exhaustiveness-check`, `noFallthroughCasesInSwitch` | Every variant handled or an explicit `default` that throws |
| T5 | `any` (explicit or implicit) | `no-explicit-any` (error), `strict: true` | Model the type; `unknown` + narrowing at boundaries |
| T6 | non-null assertion `!` | `no-non-null-assertion` | Narrow with a check that throws on violation |
| T7 | code path without a return under conditionals | `noImplicitReturns` | Every path returns or throws explicitly |

`front/` already builds with `strict: true`; T-rules apply to it as review guidance until its
lint config is hardened (tracked separately — see plan `code-stability-enforcement`).

## Deny-list — both stacks (review-enforced)

| # | Forbidden | Detected by | Refuse instead |
|---|-----------|-------------|----------------|
| X1 | copy-pasted logic blocks | `pnpm dupcheck` (jscpd) | Extract and reuse; threshold gate fails the check |
| X2 | semantic duplication (same validation/transform reimplemented) | review rule | **Search for an existing implementation before writing a new one** — link the search in the PR if you wrote new code anyway |
| X3 | mock/stub/hardcoded data in production code paths | review rule (grep `mock`, `dummy`, `fake`, `TODO.*real`) | Production paths consume real inputs or refuse; test doubles live in tests |
| X4 | catch-and-return-default ("fake fallback") | review rule | Propagate a typed error; the caller decides, visibly |

## Not covered here (explicit boundary)

- **ML inference quality** — a model that runs but confidently misses falls raises no exception;
  no rule in this document can catch it. That is a runtime-monitoring concern (research §3),
  not a code-stability one. Mixing the two dilutes both.
- **Resilience fallbacks** (circuit breakers, graceful degradation): the default in this repo is
  fail-fast; a legitimate resilience exception must use the documented escape hatch — an explicit,
  logged, alert-raising degradation, never a silent one.
