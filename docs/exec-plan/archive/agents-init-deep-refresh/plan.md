---
slug: agents-init-deep-refresh
title: "Refresh root AGENTS with init-deep project map"
type: plan
date: 2026-07-03
status: done
---
<!-- NOTE: plan body is immutable after finalize.
     Finalize = the first git commit that includes this plan.md in docs/exec-plan/active/.
     Scope change -> create a new slug, archive this plan with:
       status: superseded-by
       superseded-by: {new-slug}
     spec.md uses the same schema; a spec-only folder (no plan written) is closed by setting
     status: discarded directly to spec.md frontmatter, then moving the folder to archive/.
     Only the frontmatter status line(s) are mutable post-finalize. -->

## Goal

Regenerate the root `AGENTS.md` using `omo:init-deep` update mode so it works as a project knowledge base, not a runtime scratch or workflow anthology.

## Scope

- Keep root `AGENTS.md` focused on project overview, structure, where to look, code map, commands, and repo-specific conventions.
- Remove or demote duplicated runtime/scratch details such as `.omc`, `.omo`, `.omx`, and `.gjc` from the root knowledge surface.
- Narrow E2E language so it protects real-surface claims without forcing every ordinary change through full production E2E.
- Preserve existing scoped `AGENTS.md` files unless scoring shows an immediate root-level mismatch.

## Verification

- Read `omo:init-deep` and existing AGENTS hierarchy before editing.
- Check generated root file against init-deep quality gates: 50-150 lines, project-specific, no generic advice, no parent/child duplication.
- Run a focused text audit for removed scratch/runtime overreach and retained project routing.
