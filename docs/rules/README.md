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
| [github-labels.md](./github-labels.md) | repo-wide | Label taxonomy: one required `type:` label per issue/PR drives the `<type>` component of branch names; `type: feat/fix/chore/docs/refactor/test`. |
| [ml-training.md](./ml-training.md) | `ml/training/` | Locked training parameters (`T_WINDOW`, `STRIDE`, `OVERLAP_THRESHOLD`, etc. — `config.py` is the single source of truth); contracts for window labelling, train/eval split, threshold policy, and gold-clip evaluation. Records ADR-013. |
| [worktree-workflow.md](./worktree-workflow.md) | repo-wide | Never work directly on a protected branch; every issue maps to a branch `<type>/<issue#>-<slug>` and one worktree; use `git wt <issue#>` to create. Records ADR-008. |
| [pr-decomposition-and-review.md](./pr-decomposition-and-review.md) | repo-wide | Keep PRs reviewable: split `size/L`/`size/XL` work into `size/M` or smaller issue slices, document stacked/fan-out boundaries, and require a review pass per PR. |
| [front-admin-crud.md](./front-admin-crud.md) | `front/src/app/admin/**` | A new admin entity page is config, not copy-paste: the list/create/save/delete state machine lives once in `front/src/lib/useCrud.ts`; pages own only form-field state + JSX. Co-loaded reference lists = a second `useCrud` instance with combined flags. `<AdminShell>` chrome wrapper deferred (#202). |
| [ml-dataset-custody.md](./ml-dataset-custody.md) | fleet-wide (m3-pro ↔ m1-pro) | Who is the authority for each asset class (footage → m3 main checkout; labels → git branch, human-confirmed only; models → m1 until adoption), one-way sync per class, staging-dir transfer procedures (`~/eldercare-staging`, TCC workaround, FILELIST + STAGING_DONE handshake, no `--delete`), domain provenance registry. Records ADR-018. |

---

## Rule: ADRs must be MECE

Every ADR in `docs/decisions/` must be **MECE** — Mutually Exclusive,
Collectively Exhaustive — with respect to the decisions it records.

- **Mutually Exclusive.** One ADR records **one** cross-cutting decision. Two
  ADRs must not overlap or relitigate the same choice. When a new ADR touches an
  area an existing ADR owns, it must explicitly state what it does **not**
  reopen, and scope itself to the genuinely new decision. (Example: ADR-006
  placed the frame-source intake in `ml/util/` and explicitly excluded the
  model-contract placement and demo-UX — now superseded by ADR-056, which moves
  intake to `ml/sources/` in the edge-device relayout; the principle still
  holds.)
- **Collectively Exhaustive.** Within an ADR, the decision is recorded in full:
  the context that forced it, the option chosen, the alternatives weighed and
  why they were rejected, and the trade-offs accepted. A reader should not need
  another document to understand *why* the decision was made.

The boundary test: if a choice is implementation detail of one feature, it
belongs in that feature's plan, not an ADR. If it is cross-cutting and
expensive-to-reverse, it gets its **own** ADR — not a paragraph bolted onto an
existing one. When a decision changes, write a new ADR that supersedes the old
one (never edit a finalized ADR's body, never delete it).

See [docs/decisions/README.md](../decisions/README.md) for the ADR lifecycle.
