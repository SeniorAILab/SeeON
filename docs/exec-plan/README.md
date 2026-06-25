# exec-plan — Work-Scoped Plan Store

Two buckets. Folder position = lifecycle state. No separate status machine.

```
docs/exec-plan/
├── active/{slug}/    ← work in progress
│   ├── spec.md       ← deep-interview output (what + requirements)
│   └── plan.md       ← implementation plan (how + steps); body immutable after finalize
└── archive/{slug}/   ← done, discarded, or superseded
    ├── spec.md
    └── plan.md       ← frontmatter carries status: done | discarded | superseded-by
                         (+ superseded-by: {new-slug} when applicable)
```

## Lifecycle in one sentence

Create `active/{slug}/` with spec (+ plan when planning begins) → execute → add `status:` line(s) to plan.md (or spec.md if no plan exists) → move entire folder to `archive/{slug}/`.

**Spec-only closure:** If a spec is promoted to `active/{slug}/spec.md` but no plan is ever written (work abandoned, scope cancelled, or superseded before execution), add `status: discarded` directly to spec.md frontmatter and move the folder to `archive/{slug}/`.

## Slug convention

`{kebab-description}` — lowercase, hyphens only, no date prefix, no issue numbers.
Date and author are stored in frontmatter, not the folder name.
**The folder name is authoritative as the slug.** The frontmatter `slug` field must be
identical to the folder name — treat a mismatch as an error.

Examples:
- `agent-driven-docs-execplan-convention`
- `streamlit-preprocessed-poc`

## Frontmatter schema

```yaml
---
slug: {slug}                    # must match folder name exactly (folder is authoritative)
title: "Human readable title"
type: plan                      # or: spec
date: YYYY-MM-DD
# --- archive-only: omit these lines while active ---
# status: done | discarded | superseded-by
# superseded-by: {new-slug}     # required when status is superseded-by
---
<!-- NOTE: plan body is immutable after finalize.
     Finalize = the first git commit that includes this plan.md in docs/exec-plan/active/.
     Scope change -> create a new slug, archive this plan with:
       status: superseded-by
       superseded-by: {new-slug}
     spec.md uses the same schema; a spec-only folder (no plan written) is closed by setting
     status: discarded directly in spec.md frontmatter, then moving the folder to archive/.
     Only the frontmatter status line(s) are mutable post-finalize. -->
```

## Plan-first invariant

Every meaningful change must have a `docs/exec-plan/active/{slug}/` entry **before** any code is
modified. Enforcement is convention-level — no hook-based hard gate this cycle.

## exec-plan vs. docs/decisions

| | exec-plan | docs/decisions |
|---|---|---|
| Scope | Work-scoped (one feature/task) | Cross-cutting (constrains all future work) |
| Lifespan | Archivable when work ends | Permanent (superseded, never deleted) |
| Body | Immutable after finalize | Superseded by new ADR |
| Author | omc-plan / omo / omx | craft-skills documents skill |

When a plan contains a cross-cutting, expensive-to-reverse choice, that choice is **distilled** into a new `docs/decisions/ADR-NNN-*.md` — the plan entry itself is not replaced.

## Trivial exemptions (no plan needed)

- Typo / comment / doc wording fixes
- Lint or format-only changes
- Dependency patch-version bumps
- Purely behavior-preserving renames
