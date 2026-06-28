---
slug: native-dev-command-simplification
status: active
issue: 426
author: gjc
date: 2026-06-27
---

# native-dev-command-simplification

> Consensus plan (ralplan run `019f091d`): Architect CLEAR/APPROVE, Critic OKAY.
> Durable scratch: `.gjc/.../ralplan/019f091d/pending-approval.md` + `stage-03-post-interview.md` (user overrides). Issue #426.

## Goal
Make each instance's dev run command native, simple, and actually working — no Docker packaging in daily dev (ADR-063), RLS/db untouched.

## Scope (Pareto-ordered)
1. **Worker (breakage fix)** — `pnpm dev:ml-worker` currently errors (no `--config`; documented `ml-worker.local.yaml` absent).
   - Add minimal **unfenced** `ml/worker/__main__.py` → `python -m worker` (idiomatic Python package entry, symmetric with `api.main:app`). Keep `python -m worker.edge_worker` working everywhere (prod compose, scripts, tests untouched).
   - `package.json` `dev:ml-worker` → `uv run --directory ml python -m worker --config config/ml-worker.local.yaml`.
   - `ml/config/ml-worker.local.yaml` is a **secret/gitignored** file (like `.env.local`): gitignored, `cp` from `ml-worker.example.yaml`. Example stays committed + unedited.
2. **Docs + ADRs** — AGENTS.md / README.md / ml/AGENTS.md / ml/worker/AGENTS.md / ml/README.md / docs/onboarding/edge-device.md reflect the working commands + the gitignored-local + `cp` policy. ADR-001 (root-script contract note for `python -m worker`), ADR-063 (stale `dev:ml` → `dev:ml-api` + `dev:ml-worker`).
3. **Backend SWC** (evidence-gated speed) — `nest-cli.json` builder `swc` + `typeCheck: false`; add devDeps `@swc/cli @swc/core`; record before/after watch timing; keep only with green `pnpm --filter backend test` + `pnpm typecheck` + app boot.

## Explicit non-changes
- `dev:ml-api` (uvicorn default reload already correct), `dev:front` (vite), RLS / `fall_app` / `DIRECT_URL` / `withFacilityContext` / migrations / db roles. No in-repo fake RTSP.

## Acceptance
- **A (faster/working):** after `cp`, `pnpm dev:ml-worker --check-config` → exit 0 `{"ok":true,"cameras":N}`; `python -m worker` and `python -m worker.edge_worker` forms both work. SWC: recorded before/after watch timing + green test/typecheck/boot.
- **B (no docker in dev):** no `docker|compose|buildx|podman` in any `dev:*` script (only `db:up` uses Docker).
- **C (docs correct):** assertions fail on stale committed/tracked-local wording, stale `dev:ml` (`dev:ml(?![-\w])`, ignoring `dev:ml-api`/`dev:ml-worker`); `.gitignore` contains `ml/config/ml-worker.local.yaml`.

## Why / alternatives (ADR distilled)
Additive `__main__.py` over rename (rename = high blast: prod `compose.edge.yaml`, scripts, ADR-001, tests, two active plans). `console_scripts` rejected (`ml/pyproject.toml` `[tool.uv] package = false`). Secret/gitignored local config (user decision) mirrors `.env.local`.

## Risks
- Collision with active plans (`night-bed-exit-edge-e2e`, `ml-edge-a-worker-portable-runtime-layout`) on `edge_worker.py` / `ml-worker.example.yaml` / `AGENTS.md` → mitigated: additive files only, no `edge_worker.py`/example edits, tight isolated AGENTS.md edit + rebase.
