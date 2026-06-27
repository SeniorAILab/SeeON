---
slug: vc-convention-consolidation
issue: 393
status: active
author: gobeumsu
created: 2026-06-27
---

# Plan — Version-control convention consolidation (#393 slice 1)

## Target structure

**Decision layer (ADR):** ADR-008 becomes the single **"Version Control"** decision record,
absorbing ADR-039 (PR size) and ADR-040 (issue autolabel). ADR-016 (enforcement-timing
principle) stays separate — it is cross-cutting (referenced by backend ADR-064 / backend-lint
rule) — and is cross-linked from ADR-008.

**Rule layer (SSOT) — single hub + 4 MECE facets:**

| Facet | Rule SSOT | Why-ADR |
|-------|-----------|---------|
| Branch & Worktree (+ lane-pool) | `docs/rules/worktree-workflow.md` | ADR-008 |
| Issue labeling | `docs/rules/github-labels.md` | ADR-008 (was 040) |
| PR, Review & Merge | `docs/rules/pr-decomposition-and-review.md` | ADR-008 (was 039) |
| Commit | `docs/rules/commit-convention.md` *(new)* | — |

Hub: `docs/rules/version-control.md` *(new)* — single entry point: names the 4 facets,
links each rule SSOT, and links ADR-008 (+ ADR-016 cross-cut). `AGENTS.md` routes to the
hub only (no rule body).

## Steps (execution order)

1. **Rework ADR-008 → single "Version Control" decision** (`docs/decisions/common/ADR-008-*.md`):
   - Retitle to reflect the version-control domain.
   - Absorb ADR-039 content: PR size threshold (XL>1000 hard, L>500 recommended), logic-churn
     basis, `size/override` hatch — as a Decision section + its drivers.
   - Absorb ADR-040 content: `issue-auto-label.yml` maps issue Type → one `type:` label,
     fail-closed — as a Decision section.
   - Keep lane-pool lifecycle paragraph (already drafted); cross-link ADR-016 for timing.
   - Add `## Changelog`: `- 2026-06-27: fold ADR-039 (PR size) + ADR-040 (autolabel) into this
     VC decision; add lane-pool lifecycle complement (#393).`

2. **Delete folded ADRs**: remove `ADR-039-pr-size-gate-threshold.md` and
   `ADR-040-issue-type-autolabel.md`.

3. **Repoint inbound references** to ADR-008:
   - `docs/decisions/README.md` — collapse 039/040 rows into the ADR-008 row.
   - `docs/rules/pr-decomposition-and-review.md` (cites ADR-039) → ADR-008.
   - `docs/rules/github-labels.md` / `worktree-workflow.md` (cite ADR-040) → ADR-008.
   - grep `ADR-039|ADR-040` across repo; fix every hit.

4. **Amend ADR-lifecycle governance** (`docs/decisions/README.md`): permit **domain-scoped
   ADRs** (one ADR may hold several small same-domain decisions) — records the relaxation that
   justifies folding 039/040. Keep MECE-by-domain + References/Refines; numbers still not reused.

5. **New `docs/rules/commit-convention.md`** (commit SSOT): conventional-commit prefixes
   (mirror `type:` set, link github-labels), imperative subject, atomic-commit principle,
   Co-Authored-By trailer policy. Short.

6. **Move merge-discipline body** from `AGENTS.md` §Conventions → `pr-decomposition-and-review.md`
   as `## Merge discipline` (local pre-push is the real gate; never merge on pending/red
   `ci-gate`). AGENTS.md keeps only a routing link.

7. **New hub `docs/rules/version-control.md`**: framing paragraph + 4-facet table (one-line +
   links) + ADR-008 / ADR-016 links. No rule body.

8. **AGENTS.md routing collapse**: replace the separate worktree/label/PR links + CI-gate body
   with a single "Version control → docs/rules/version-control.md" route. Step flow stays.

9. **`docs/rules/README.md`**: add `version-control.md` (hub) + `commit-convention.md` rows.

10. **Drift fixes**:
    - `worktree-workflow.md` §Branch naming — slug must start `[a-z0-9]` (matches pr-check regex
      + wt.sh slugify).
    - `worktree-workflow.md` Files table — make truthful (note scope or add missing rows).
    - Verify ADR-008 PreToolUse matcher text reads `Edit|Write|NotebookEdit`.

11. **Verify**: run craft-skills `/skill:documents` over the changed set for ADR/rule + MECE
    compliance; fix flagged violations.

12. **Ship**: self-review full diff (dead links, consistency); commit on
    `docs/393-vc-convention-consolidation`; push; PR base `main`, body = #393 slice 1 (version
    control), deferred items (api convention, package boundaries), verification evidence.

## Acceptance criteria

- AC1: `docs/rules/version-control.md` hub exists; links 4 facet SSOTs + ADR-008/016.
- AC2: `AGENTS.md` has no VC rule *body* — only the hub route (grep merge-discipline text gone).
- AC3: `docs/rules/commit-convention.md` exists as commit SSOT.
- AC4: Merge-discipline rule lives in `pr-decomposition-and-review.md`.
- AC5: ADR-008 is the single VC decision (PR-size + autolabel + worktree + lane-pool);
  ADR-039 and ADR-040 files are gone; no dangling `ADR-039|ADR-040` references remain.
- AC6: ADR-016 untouched as a decision, only cross-linked.
- AC7: `decisions/README.md` ADR-lifecycle text permits domain-scoped ADRs.
- AC8: No duplicated rule body across facets (MECE); cross-refs are links only.
- AC9: `/skill:documents` reports no convention/MECE violations.
- AC10: All internal doc links resolve.

## Risks & mitigations

- Rk1: Dangling ADR-039/040 refs after delete → grep gate in step 3 + AC5.
- Rk2: Folding loses the "why 1000 / why fail-closed" rationale → absorb verbatim into ADR-008
  before trimming.
- Rk3: ADR-016 mis-folded → explicitly out (AC6); only cross-link.
- Rk4: Scope creep into other #393 facets → api-convention / package boundaries out of scope.

## Verification

- Doc-only; no package code → pre-push lint/typecheck not triggered.
- `/skill:documents` convention + MECE pass.
- `grep -rn 'ADR-039\|ADR-040'` returns only forwarding/history mentions: ADR-008 (Date,
  §3/§4 headings, Changelog), its `decisions/README.md` row, and this active plan/spec
  describing the fold. No live reference resolves to a deleted file (archive frontmatter was
  repointed to ADR-008).
- Manual internal-link check + diff self-review.

## Distill

This slice itself revises ADR governance (domain-scoped ADRs) and consolidates the VC
decision into ADR-008 — the distillation is performed inline (steps 1–4), not deferred.
