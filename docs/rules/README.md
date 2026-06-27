# Rules

Project rules are **standing conventions** every change must follow. Unlike a
plan (work-scoped) or an ADR (one cross-cutting decision), a rule is an ongoing
constraint on *how* we work in a given area.

| Rule | Scope | Summary |
|------|-------|---------|
| [streamlit-demo.md](./streamlit-demo.md) | `ml/demo/` | Live per-frame inference UI (ADR-010); allowed operator controls; `st.empty().image` render pattern; public mode never exposes nursing-home data; uploads are session-scoped; model/size/classifier selection through the model contract. |
| [ml-filesystem-layout.md](./ml-filesystem-layout.md) | `ml/` | Where each file category lives: models → `ml/models/` (single root, gitignored), domain inputs → `ml/data/{domain}/{raw,processed,poses,annotated}`, cross-domain outputs → `ml/data/eval/`, uploads → `ml/data/uploads/`. Records ADR-015 (model layout) and ADR-012 (domain-first data layout). |
| [ml-models.md](./ml-models.md) | `ml/models/` | `ml/models/` layout and `metadata.json` contract: required fields (`source`, `reacquire`, `version`), reacquire convention per source type, worktree symlink rule, `model_type` kebab-key convention. Records ADR-015. |
| [code-stability.md](./code-stability.md) | repo-wide | Deny-list against silent failure: no error swallowing (`except: pass`, empty `catch`, floating promises), typed refusal at boundaries, broad catch only at process boundaries with `logging.exception` + justification, no duplicate logic (jscpd + search-before-write). Every rule maps to a lint rule ID or grep-able pattern. Records ADR-014. |
| [version-control.md](./version-control.md) | repo-wide | **Hub / single entry point** for version control: routes to the 4 MECE facets (branch&worktree, issue labeling, commit, PR/review/merge) and to ADR-008 (why) + ADR-016 (timing). No rule body — facets own detail. |
| [github-labels.md](./github-labels.md) | repo-wide | Issue-labeling facet (hub: version-control.md). Label taxonomy: one required `type:` label per issue/PR drives the `<type>` component of branch names; `type: feat/fix/chore/docs/refactor/test`; fail-closed auto-label. Records ADR-008. |
| [commit-convention.md](./commit-convention.md) | repo-wide | Commit facet (hub: version-control.md). Conventional-commit subject reusing `<type>`, atomic commits, optional body, Co-Authored-By trailers. Records ADR-008. |
| [ml-training.md](./ml-training.md) | `ml/training/` | Locked training parameters (`T_WINDOW`, `STRIDE`, `OVERLAP_THRESHOLD`, etc. — `config.py` is the single source of truth); contracts for window labelling, train/eval split, threshold policy, and gold-clip evaluation. Records ADR-013. |
| [worktree-workflow.md](./worktree-workflow.md) | repo-wide | Branch&worktree facet (hub: version-control.md). Never work directly on a protected branch; every issue maps to a branch `<type>/<issue#>-<slug>` cut with `git switch -c` inside a persistent lane (the single worktree mode). Records ADR-008. |
| [pr-decomposition-and-review.md](./pr-decomposition-and-review.md) | repo-wide | PR/review/merge facet (hub: version-control.md). Keep PRs reviewable: split `size/L`/`size/XL` work into `size/M` or smaller issue slices, document stacked/fan-out boundaries, require a review pass per PR, and follow merge discipline (local gate is the real gate). Records ADR-008. |
| [front-admin-crud.md](./front-admin-crud.md) | `front/src/pages/admin/**` | **SUPERSEDED (Next.js-era).** The legacy `front/src/app/admin/**` + `front/src/lib/useCrud.ts` rule no longer applies — `front/` is Vite + React (ADR-055). Vite admin pages live in `front/src/pages/admin/` and use the `front/src/services/*` layer (`apiClient.ts`/`VITE_USE_MOCK`); a reusable Vite admin-CRUD convention is deferred to the AC10 follow-up. |
| [ml-dataset-custody.md](./ml-dataset-custody.md) | fleet-wide (m3-pro ↔ m1-pro) | Who is the authority for each asset class (footage → m3 main checkout; labels → git branch, human-confirmed only; models → m1 until adoption), one-way sync per class, staging-dir transfer procedures (`~/eldercare-staging`, TCC workaround, FILELIST + STAGING_DONE handshake, no `--delete`), domain provenance registry. Records ADR-018. |
| [backend-architecture-lint-and-guard.md](./backend-architecture-lint-and-guard.md) | `backend/**` | Mechanical enforcement of ADR-046 layering: warn-first built-in ESLint for controller/repository/service import boundaries + inline-DTO placement + new typed rules (no new deps, no existing-error downgrade); single-source `scripts/backend-guard/check-schema-migration.sh` blocks schema-without-migration at pre-commit + CI; tenant isolation stays structural (RLS + PrismaService runtime guard). Records ADR-064; respects ADR-008/ADR-016. |

---

## Rule: ADRs must be MECE

Every ADR in `docs/decisions/` must be **MECE** — Mutually Exclusive,
Collectively Exhaustive — with respect to the decisions it records.

- **Mutually Exclusive.** No two ADRs overlap or relitigate the same choice. When
  a new ADR touches an area an existing ADR owns, it must explicitly state what it
  does **not** reopen, and scope itself to the genuinely new decision. (Example:
  ADR-006 placed the frame-source intake in `ml/util/` and explicitly excluded the
  model-contract placement and demo-UX — now updated by ADR-056, which moves intake
  to `ml/sources/` in the edge-device relayout; the principle still holds.) MECE is
  tested **between** ADRs, not as a one-decision-per-file rule: one ADR may record
  several small, tightly-related decisions of the **same domain** when they are only
  meaningful together (e.g. ADR-008 owns the whole version-control domain).
- **Collectively Exhaustive.** Within an ADR, the decision is recorded in full:
  the context that forced it, the option chosen, the alternatives weighed and
  why they were rejected, and the trade-offs accepted. A reader should not need
  another document to understand *why* the decision was made.

The boundary test: if a choice is implementation detail of one feature, it
belongs in that feature's plan, not an ADR. If it is cross-cutting and
expensive-to-reverse, it belongs in an ADR — its own when it stands alone, or
folded into the owning domain ADR when it is one of several tightly-related
same-domain choices. When a decision changes, **edit the ADR in place** so it states
only the current decision, add one line to its `## Changelog`, and link related atomic
ADRs with `References:` / `Refines:`; git holds the history (no supersede chains). The
only sanctioned ADR-file deletion is **folding** same-domain ADRs into one (move
content, repoint references, record the fold in the owner's Changelog).

See [docs/decisions/README.md](../decisions/README.md) for the full ADR lifecycle,
domain-granularity rule, and folding/numbering policy.
