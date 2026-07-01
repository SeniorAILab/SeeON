# Rules

Project rules are standing conventions every change must follow. Unlike a plan, which is scoped to one work item, a rule is an ongoing constraint on how we work in a given area.

ADR remains the name for architectural decision records, but the ADR set has been reset. Expensive decisions now live in the [ADR README](../decisions/README.md) only when they truly need ADR-level rationale, or in the owning rule, API, domain, onboarding, or script document when they are operational rules. Do not recreate numbered ADR files for new work by default.

| Rule | Scope | Summary |
|------|-------|---------|
| [streamlit-demo.md](./streamlit-demo.md) | `ml/demo/` | Live per-frame inference UI; allowed operator controls; `st.empty().image` render pattern; public mode never exposes nursing-home data; uploads are session-scoped; model/size/classifier selection goes through the model contract. |
| [ml-filesystem-layout.md](./ml-filesystem-layout.md) | `ml/` | File category layout: models -> `ml/models/` (single root, gitignored), domain inputs -> `ml/data/{domain}/{raw,processed,poses,annotated}`, cross-domain outputs -> `ml/data/eval/`, uploads -> `ml/data/uploads/`. |
| [ml-models.md](./ml-models.md) | `ml/models/` | `ml/models/` layout and `metadata.json` contract: required fields (`source`, `reacquire`, `version`), reacquire convention per source type, worktree symlink rule, `model_type` kebab-key convention. |
| [code-stability.md](./code-stability.md) | repo-wide | Deny-list against silent failure: no error swallowing (`except: pass`, empty `catch`, floating promises), typed refusal at boundaries, broad catch only at process boundaries with `logging.exception` + justification, no duplicate logic. Every rule maps to a lint rule ID or grep-able pattern. |
| [version-control.md](./version-control.md) | repo-wide | Hub for version control: routes to branch/worktree, issue labeling, commit, and PR/review/merge facets. No rule body; facets own detail. |
| [github-labels.md](./github-labels.md) | repo-wide | Issue-labeling facet. One required `type:` label per issue/PR drives the `<type>` component of branch names; `type: feat/fix/chore/docs/refactor/test`; fail-closed auto-label. |
| [commit-convention.md](./commit-convention.md) | repo-wide | Commit facet. Conventional-commit subject reusing `<type>`, atomic commits, optional body, Co-Authored-By trailers. |
| [ml-training.md](./ml-training.md) | `ml/training/` | Locked training parameters (`T_WINDOW`, `STRIDE`, `OVERLAP_THRESHOLD`, etc.); `config.py` is the single source of truth for training/evaluation constants; window labelling, split, threshold, and gold-clip evaluation contracts live here. |
| [worktree-workflow.md](./worktree-workflow.md) | repo-wide | Branch/worktree facet. Never work directly on a protected branch; every issue maps to a branch `<type>/<issue#>-<slug>` cut with `git switch -c` inside a persistent lane. |
| [pr-decomposition-and-review.md](./pr-decomposition-and-review.md) | repo-wide | PR/review/merge facet. Keep PRs reviewable: split large work into `size/M` or smaller issue slices, document stacked/fan-out boundaries, require review per PR, and follow merge discipline. |
| [front-admin-crud.md](./front-admin-crud.md) | `front/src/pages/admin/**` | Superseded Next.js-era rule. The current frontend is Vite + React; admin pages live in `front/src/pages/admin/` and use the `front/src/services/*` layer. A reusable Vite admin-CRUD convention is deferred. |
| [ml-dataset-custody.md](./ml-dataset-custody.md) | fleet-wide (m3-pro <-> m1-pro) | Authority and transfer procedure for footage, labels, and model assets; one-way sync per class; staging-dir transfer procedures; domain provenance registry. |
| [backend-architecture-lint-and-guard.md](./backend-architecture-lint-and-guard.md) | `backend/**` | Backend layering and DTO enforcement: built-in ESLint for controller/repository/service import boundaries and inline DTO placement; single-source backend guard blocks schema-without-migration at pre-commit and CI; tenant isolation remains structural. |
| [local-dev-command-taxonomy.md](./local-dev-command-taxonomy.md) | repo-wide | MECE local dev command taxonomy: daily commands are `dev:front`, `dev:backend`, `dev:ml`; DB and Prisma are backend-owned; ML components live under `dev:ml:*`. |

## ADR Capture

If a future change makes an expensive-to-reverse decision, put the durable current rule where future work will naturally look:

- Workflow conventions go in the relevant `docs/rules/` facet.
- Wire contracts go in `docs/api/`.
- Domain semantics go in `docs/domain/`.
- Runtime topology and high-level boundaries go in `docs/architecture.md` or the onboarding doc for that surface.
- Rare ADR-level summaries go in `docs/decisions/README.md`.
- One-off implementation order stays in the work plan.
- Evidence and comparisons stay in `docs/research/` until a decision is made.

Recommended note shape for the owning document:

- Current rule: the rule future work must follow now.
- Why this exists: the short reason, not a full historical essay.
- Rejected alternatives: only the alternatives that prevent future relitigation.
- Where enforced: tests, lint, scripts, CI, runtime guard, or human review.

Keep research factual and pre-decision. Keep plans work-scoped. Do not recreate deleted `ADR-NNN-*.md` files, retired stubs, or an ADR archive.
