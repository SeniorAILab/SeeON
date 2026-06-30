# Commit Convention

> Standing convention for commit messages — the commit facet of version control
> (hub: `docs/rules/version-control.md`). The branch `<type>` and the issue `type:` label
> share this prefix vocabulary; see `docs/rules/github-labels.md` and
> `docs/rules/worktree-workflow.md`.

## Rule

Each commit is **one atomic, self-consistent change** with a Conventional-Commits subject:

```
<type>(<scope>): <imperative summary>
```

- **`<type>`** — one of the same six prefixes the branch and issue `type:` label use:
  `feat | fix | chore | docs | refactor | test`. Match the dominant intent of the change.
- **`<scope>`** *(optional)* — the area touched: `ml`, `backend`, `front`, `docs`, `ci`,
  `git-guard`, or a narrower module. Omit when a change is genuinely cross-cutting.
- **summary** — imperative mood ("add", not "added"/"adds"), no trailing period, ≤ ~72 chars.

## Body (optional)

Add a body when the *why* is not obvious from the subject. Explain intent and consequence,
not a line-by-line restatement of the diff. Wrap at ~72 columns. Reference the issue
(`#<n>`) when the commit is part of tracked work.

## Atomicity

- One logical change per commit. Do not bundle an unrelated cleanup, format-only churn, or a
  scope expansion into a feature commit — those are separate commits (and often separate PRs;
  see `docs/rules/pr-decomposition-and-review.md`).
- A commit should leave the tree in a coherent state; avoid "WIP" commits on a branch that is
  about to be reviewed (squash or reword them first).

## Trailers

When an agent authors or co-authors a commit, record it with a trailer:

```
Co-Authored-By: <Name> <email>
```

Do not fabricate authorship. Keep trailers to attribution and issue references; everything
else belongs in the body.

## Relationship to other version-control facets

- **Branch / worktree** — `docs/rules/worktree-workflow.md` (branch naming reuses `<type>`).
- **Issue labels** — `docs/rules/github-labels.md` (`type:` label is the SSOT for `<type>`).
- **PR / review / merge** — `docs/rules/pr-decomposition-and-review.md`.
- **Why** — decision map.
