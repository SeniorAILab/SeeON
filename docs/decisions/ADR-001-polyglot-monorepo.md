# ADR-001: Polyglot Monorepo with Per-Ecosystem Dependency Management

## Status

Accepted

## Date

2026-06-07

## Context

`eldercare-fall-ai` is a fall-detection platform composed of three discrete technical domains:

- **front/** — a Next.js / TypeScript browser client that renders the monitoring UI
- **backend/** — a NestJS / TypeScript API server that owns alert policy, webhook dispatch, and Prisma-managed persistence
- **ml/** — a Python project that owns the full ML lifecycle: FastAPI serving (online path), model training (batch path, currently deferred), and a Streamlit demo

These domains differ fundamentally in language runtime, package manager, and deployment lifecycle. The question is how to co-locate them in a single repository without forcing one ecosystem's tooling to manage the other.

### Toolchain reality at scaffold time

| Tool | Version | Verification |
|---|---|---|
| Node.js | 24.16.0 (LTS) | `engines: { "node": ">=24" }` in root `package.json` |
| pnpm | 10.32.1 | `packageManager: "pnpm@10.32.1"` pinned in root `package.json` |
| uv | 0.10.4 | present in PATH; `ml/pyproject.toml` is a native uv project |
| Python | ≥ 3.11 | `requires-python = ">=3.11"` in `ml/pyproject.toml` |

Pinning `packageManager` in `package.json` causes pnpm and Corepack to enforce the exact version, preventing "works on my machine" drift across contributors.

### The cross-language tension

Python ML workloads carry native-extension dependencies (numpy, uvicorn with C extensions, and eventually PyTorch / ultralytics). These cannot be expressed in a Node-centric lock file. Conversely, Node/TypeScript tooling (ESLint, tsc, Prisma) has no meaningful place inside a Python virtual environment. Any solution that tries to merge these two worlds into a single lock file ends up owning neither well.

## Decision

Adopt a **polyglot monorepo** structure where each language ecosystem retains full ownership of its own dependency graph and lock file:

### TypeScript workspace (pnpm)

`pnpm-workspace.yaml` declares exactly two member packages:

```yaml
packages:
  - front
  - backend
```

`pnpm install` at the repo root installs both packages and produces a single `pnpm-lock.yaml` that covers all TypeScript dependencies. The workspace enables `pnpm --filter <name>` targeting used throughout the root scripts.

### Python project (uv) — deliberately excluded

`ml/` is a standalone uv project (`ml/pyproject.toml`, `ml/uv.lock`). It is **not** listed in `pnpm-workspace.yaml` and is **not** referenced by any pnpm mechanism. It is installed independently:

```
cd ml && uv sync          # install serving deps (always-on)
cd ml && uv sync --group demo    # additionally install Streamlit for demo
```

`ml/pyproject.toml` sets `[tool.uv] package = false`, meaning `ml` is treated as a project rather than a distributable library — appropriate for an application that is run, not imported.

### Root `package.json` as orchestration layer only

The root `package.json` carries **zero runtime or shared library dependencies**. Its sole purpose is to expose cross-cutting scripts that delegate into each sub-system:

| Script | Delegates to |
|---|---|
| `dev:front` | `pnpm --filter front dev` |
| `dev:backend` | `pnpm --filter backend start:dev` |
| `dev:ml` | `uv run --directory ml uvicorn serving.main:app --reload --host 0.0.0.0 --port 8000` |
| `dev:demo` | `uv run --directory ml --group demo streamlit run demo/app.py` |
| `build:front` | `pnpm --filter front build` |
| `build:backend` | `pnpm --filter backend build` |
| `typecheck` | `pnpm --filter front exec tsc --noEmit && pnpm --filter backend exec tsc --noEmit` |
| `lint` | `pnpm -r lint && uv run --directory ml ruff check .` |
| `format` | `pnpm --filter backend format && uv run --directory ml ruff format .` |
| `db:up` | `docker compose up -d db` |
| `db:down` | `docker compose down` |
| `prisma:generate` | `pnpm --filter backend exec prisma generate` |
| `prisma:migrate` | `pnpm --filter backend exec prisma migrate dev` |

`dev:ml` and `dev:demo` invoke `uv run --directory ml` directly from the root, so operators never need to `cd ml` for day-to-day development. `dev:demo` passes `--group demo` to activate the `[dependency-groups] demo` entry in `pyproject.toml` (which pins `streamlit>=1.38`) without polluting the always-on serving environment.

### Dependency lock separation

| Lock file | Covers | Install command |
|---|---|---|
| `pnpm-lock.yaml` (repo root) | `front/` + `backend/` | `pnpm install` (at repo root) |
| `ml/uv.lock` | `ml/` serving + optional groups | `uv sync [--group demo]` (inside `ml/`) |

There is no single unified lock file. Two install commands are the deliberate contract; the root scripts bridge the operational gap so daily workflows remain single-command at the root level.

## Alternatives Considered

### 1. Single JS-centric build system (Nx or Turborepo) managing Python too

Nx and Turborepo support polyglot task graphs through custom executors or shell task runners. In principle, `nx run ml:serve` could shell out to `uv run`. However:

- **Dependency management is not unified** — these tools orchestrate tasks, not package resolution. Python deps would still require `uv` or `pip`; the added Nx/Turborepo layer would be pure ceremony with no lock-file benefit.
- **Overhead without payoff at PoC scale** — Nx's computation cache and affected-graph intelligence pay off in large monorepos with many packages and slow CI. With two TS packages and one Python project, the configuration cost exceeds the value.
- **Learning curve and lock-in** — Nx in particular requires workspace-level configuration (`project.json`, `nx.json`, executors) that becomes load-bearing infrastructure. Migrating away later is non-trivial.

Rejected in favour of a lighter root `package.json` scripts layer.

### 2. Polyrepo (separate Git repositories)

Three independent repositories (`eldercare-front`, `eldercare-backend`, `eldercare-ml`) would give each team full autonomy. The costs at this stage are prohibitive:

- **Cross-cutting changes require coordinated PRs** across repos (e.g., changing the `/predict` API contract requires a PR in `eldercare-ml` and a coordinated PR in `eldercare-backend`).
- **Shared tooling and CI configuration must be duplicated or extracted** to a fourth "platform" repo, adding governance overhead.
- **Local development requires three clones** and manual orchestration; there is no single `dev:*` entry point.
- **Discovery cost** — a new contributor must understand three repositories to make a single end-to-end change.

Rejected. The monorepo's single clone, unified git history, and root-level orchestration scripts outweigh the isolation benefits at the current team size and PoC phase.

### 3. Git submodules

Submodules would allow each sub-project to have its own git history while being referenced from a parent repo. In practice:

- Submodule state is not automatically updated on `git pull`; contributors must remember `git submodule update --init --recursive`.
- Tooling support (GitHub UI, IDE integrations) for submodules is inconsistent and error-prone.
- Submodule boundaries do not align with our need — we do not want `front`, `backend`, and `ml` to have independent git histories; we want atomic cross-cutting commits.

Rejected. The operational friction of submodules provides no benefit here.

### 4. Single combined environment (all languages in one lockfile)

A hypothetical "universal" environment — e.g., a Conda environment that installs both Node packages and Python packages — would unify the install step. In practice:

- Conda-managed Node is significantly behind upstream; using it alongside pnpm introduces version conflicts.
- Python package resolution in Conda does not honour `pyproject.toml` / PEP 517 standards as cleanly as uv.
- The implied environment size is large and slow to resolve.
- The `packageManager` field in `package.json` (which pins pnpm) and the `[tool.uv]` block in `pyproject.toml` both reflect intentional, standards-conformant toolchain choices that would be lost inside a Conda envelope.

Rejected. Per-ecosystem tools at their native versions are more correct and faster than a unified environment.

## Consequences

### Positive

- **Clean ecosystem boundaries.** TypeScript tooling (tsc, ESLint, Prisma CLI) never touches the Python environment, and vice versa. Dependency upgrades and security patches remain scoped to the relevant ecosystem.
- **Lock-file fidelity.** `pnpm-lock.yaml` is a pure Node/TS lock file. `ml/uv.lock` is a pure Python lock file. Both are reproducible and meaningful to their respective package managers.
- **Single-command developer experience** for common tasks. `pnpm dev:front`, `pnpm dev:backend`, `pnpm dev:ml`, and `pnpm dev:demo` all work from the repo root; contributors do not need to know which sub-directory owns which process.
- **Exact toolchain enforcement.** `packageManager: "pnpm@10.32.1"` and `engines: { "node": ">=24" }` cause Corepack and pnpm to reject mismatched environments at install time, preventing silent version drift.
- **Lifecycle separation in `ml/`.** Serving dependencies (fastapi, uvicorn, pydantic, numpy) are always installed. Training dependencies (ultralytics, torch — currently an empty group placeholder) and demo dependencies (streamlit) are optional groups, keeping the production serving image lean.

### Negative / Trade-offs

- **Two install commands.** A developer setting up the repo for the first time must run both `pnpm install` (at root) and `uv sync` (inside `ml/`). This is documented in the README and partially mitigated by the root `dev:ml` script, but it cannot be reduced to a single command without abandoning per-ecosystem lock files.
- **Root scripts are the cross-cutting contract.** Any change to how a sub-project is started, built, or linted must be reflected in root `package.json`. The root `package.json` is intentionally lightweight (no app deps), but it must be kept in sync with sub-project entry points.
- **No unified task graph / caching.** Unlike Nx or Turborepo, sequential root scripts do not know about task dependencies (e.g., "build backend before running typecheck"). This is acceptable at PoC scale but may need revisiting if CI build times become a bottleneck.
- **`ml/` is invisible to pnpm.** `pnpm -r lint` covers only `front` and `backend`; the root `lint` script explicitly appends `&& uv run --directory ml ruff check .` to include Python. Any future pnpm-recursive operation must be audited to confirm it includes an equivalent Python invocation.
