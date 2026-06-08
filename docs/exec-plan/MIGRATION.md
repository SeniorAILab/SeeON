# exec-plan Migration — Scattered Artifact Classification

**Recommendations only — do NOT move files while concurrent work is in flight; migrate when each feature's work settles.**

The table below classifies nine plan/spec artifacts found across `.omc/`, `.omo/`, and `.omx/` scratch
stores. No files have been moved. Apply each recommendation manually as its feature's work settles.

## Recommended destinations

| Artifact | Recommended destination | Recommended status | Reason |
|---|---|---|---|
| `.omc/plans/plan-fall-video-skill-optimization.md` | `active/fall-video-skill-optimization/plan.md` | active | Plan dated 2026-06-07, status "pending approval"; skill rewrite not yet committed; pairs with spec entry below |
| `.omo/plans/issue-13-streamlit-realtime-fall-demo.md` | `active/streamlit-preprocessed-poc/plan.md` | active | Directly corresponds to in-flight branch `codex/issue13-streamlit-preprocessed-poc`; modified `ml/demo/` files visible in working tree |
| `.omo/plans/stage1-caregiver-restructure-autoresearch.md` | `active/stage1-caregiver-restructure/plan.md` | active | Fully authored plan; no execution evidence yet — represents the next major milestone after Stage 0 |
| `.omx/plans/prd-nursing-home-fall-cctv-mvp.md` | `archive/nursing-home-fall-cctv-mvp/plan.md` | done | Stage 0 MVP is shipped (commits `aa7eddc`, `1976943`); Streamlit demo and monorepo scaffold in main |
| `.omx/plans/ralplan-nursing-home-fall-cctv-mvp.md` | `archive/nursing-home-fall-cctv-mvp/ralplan.md` | done | Consensus plan for the same completed Stage 0 feature; archive alongside PRD and test-spec in one folder |
| `.omx/plans/test-spec-nursing-home-fall-cctv-mvp.md` | `archive/nursing-home-fall-cctv-mvp/test-spec.md` | done | Test spec for completed Stage 0 MVP; same slug folder as PRD |
| `.omc/specs/deep-interview-eldercare-fall-video-skill.md` | `active/fall-video-skill-optimization/spec.md` | active | Passed deep-interview (4.8% ambiguity, 2026-06-07); no plan execution started; pairs with plan entry above |
| `.omc/specs/deep-interview-fall-platform-scaffold.md` | `archive/fall-platform-scaffold/spec.md` | done | Scaffold committed in `1976943`; no further execution expected under this spec |
| `.omc/specs/deep-interview-indomain-control.md` | `active/indomain-control-experiment/spec.md` | active | Generated 2026-06-08 (today); quick-mode spec, concrete goal, no plan written yet |

## Notes

- The three `nursing-home-fall-cctv-mvp` artifacts belong to one feature and land in one archive
  folder. `prd-*.md` maps to `plan.md` (most plan-like); `ralplan-*.md` and `test-spec-*.md` keep
  their descriptive names as additional folder artifacts rather than being forced into `spec.md`.
- `fall-video-skill-optimization` has a matching spec and plan ready to promote together once the
  skill rewrite settles.
- `indomain-control-experiment` is a spec-only folder. If no plan is written before the work closes,
  apply spec-only closure: add `status: discarded` to spec.md frontmatter, then move the folder to
  `archive/indomain-control-experiment/`.
- Slug names in the destination column follow the convention (no issue numbers, no date prefix).
  Use them verbatim as folder names when promoting.
