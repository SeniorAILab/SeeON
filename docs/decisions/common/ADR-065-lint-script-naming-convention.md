# ADR-065: Monorepo lint script naming — `lint` checks, `lint:fix` fixes

## Status

Accepted

## Date

2026-06-22

## Context

[ADR-064](../backend/ADR-064-backend-layering-lint-and-guard-enforcement.md) added a non-mutating `lint:check` script to `backend/` while keeping the existing `lint` = `eslint … --fix` (mutating) "for developer cleanup". `front/` independently used `lint` = `eslint .` (non-mutating, no fix variant).

The result is that the same verb means different things per package:

| Package | `lint` (before this ADR) | check variant | fix variant |
|---|---|---|---|
| backend | `eslint … --fix` (**mutating**) | `lint:check` | `lint` |
| front | `eslint .` (check) | `lint` | — (none) |

Two problems follow. **Inconsistency**: a contributor (or agent) cannot rely on `pnpm --filter <pkg> lint` meaning the same thing across packages. **A safety footgun**: `pnpm -r lint` (the root `lint` script, used as a verification entrypoint) silently `--fix`-mutates `backend/` while only checking `front/` — a verification command must not rewrite source.

## Decision

One lint-script convention across every TypeScript package (`front`, `backend`, and any future TS package):

- **`lint`** = non-mutating ESLint **check**. This is the verification entrypoint and the only variant invoked by automation: `pnpm -r lint`, CI (`.github/workflows/ci.yml`), and the pre-push gate (`scripts/git-guard/check-lint.sh`).
- **`lint:fix`** = `eslint … --fix` (mutating). Developer cleanup only; never invoked by CI or hooks.

This **partially supersedes ADR-064**'s naming clause ("a non-mutating `lint:check` is added; the existing `--fix` `lint` stays for developer cleanup"). ADR-064's core decision is **unchanged**: backend ESLint stays warn-first (`continue-on-error` in CI, non-blocking in the pre-push gate per ADR-016) until the pre-existing `recommendedTypeChecked` error backlog is burned down, and the schema↔migration guard stays hook-blocked. Only the script *names* change — `lint:check` is removed and its behavior becomes `lint`; the old `--fix` `lint` becomes `lint:fix`.

This ADR is the **single source of truth** for the lint-script naming convention. Per-package commands are noted in each package's `AGENTS.md` (`backend/AGENTS.md`, `front/AGENTS.md`); the layering rule doc, `scripts/backend-guard/README.md`, root `AGENTS.md`, and CI reference the convention by command name and link here — they do not restate the rationale (MECE: no duplicated explanation).

## Consequences

- `pnpm -r lint` and every gate are non-mutating by default; no command silently rewrites source.
- `pnpm --filter <pkg> lint` means the same thing (check) in every package; `lint:fix` is the explicit, opt-in mutating path.
- `backend/package.json` loses `lint:check`; all callers use `lint`. `front/package.json` gains `lint:fix`.
- ADR-064 remains active for its architecture-lint and schema-guard decisions; only its naming clause is superseded here.

## Alternatives considered

- **Keep ADR-064's split (`lint`=`--fix`, `lint:check`=check).** Rejected: preserves the cross-package inconsistency and the `pnpm -r lint` mutation footgun.
- **Make `front` mirror backend (`front lint`=`--fix`, add `front lint:check`).** Rejected: spreads the mutating-`lint` footgun to `front` too and keeps the non-standard "`lint` mutates" semantics; the conventional and safer direction is `lint`=check.
