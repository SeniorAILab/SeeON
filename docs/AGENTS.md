# Docs agent rules - research, plans, ADRs, rules

## Overview
`docs/**` is the canonical knowledge surface. It separates facts found,
decisions made, work plans, standing rules, and API/domain notes.

## Where to look

| Task | Location | Notes |
| --- | --- | --- |
| Architecture map | `architecture.md`, `architecture/` | System-level overview plus deep-dive onboarding set for edge/frontend/backend flows. |
| Tooling notes | `Tools.md` | MCP and operator tooling notes. |
| API contracts | `api/` | Backend, ML serving, Kakao, realtime, route inventory. |
| Domain model | `domain/` | Alert pipeline and data dictionary. |
| Work plans | `exec-plan/` | Active/archive lifecycle for specs and plans. |
| Retired reference | `archive/` | 은퇴 참고문서 보관소 — preserved, non-normative historical docs; distinct from `exec-plan/archive/` work plans. |
| Decisions | `decisions/{ml,backend,frontend,common}/` | ADRs by active MECE category. |
| Evidence | `research/` | Findings and source comparisons before decisions. |
| Standing rules | `rules/` | Ongoing conventions that apply beyond one work item. |
| Operations | `scripts/`, `research/` | DB backup/restore in `scripts/db-backup.sh`; deploy/bootstrap in `scripts/deploy/`; camera RTSP in `research/`. |

## Conventions

- Keep artifact responsibilities separate:
  - `research/` says what was found.
  - `decisions/` says why an expensive-to-reverse choice was made.
  - `exec-plan/` says how one work item is implemented.
  - `rules/` says what ongoing convention every future change must follow.
- Plans live in `exec-plan/active/{slug}/` while work is active and move as a
  whole folder to `exec-plan/archive/{slug}/` when done, discarded, or
  superseded.
- `docs/archive/` stores retired reference documents (preserved but non-normative); keep it distinct from `docs/exec-plan/archive/`, which stores completed or superseded work-plan folders.
- Plan slug is authoritative from the folder name. Frontmatter `slug` must
  match it exactly.
- ADRs must be MECE and live in exactly one category: `ml`, `backend`,
  `frontend`, or strict `common`.
- Use `common/` only after a split attempt proves the decision still constrains
  multiple top-level ecosystems.
- Rules are not mini-ADRs. Link to the owning ADR when a rule operationalizes a
  decision, but keep the rule focused on what to do.
- Operational procedures live with their scripts (`scripts/**` headers and `scripts/deploy/AGENTS.md`) and as findings in `research/`, not in a separate runbooks tree.
- Screenshots are evidence artifacts, not design authority.

## Anti-patterns

- Do not let a research doc assert a decision.
- Do not bury an expensive-to-reverse choice inside a plan without distilling an
  ADR.
- Do not edit finalized plan bodies. Only archive-status frontmatter changes are
  mutable after finalization.
- Do not renumber ADRs or move a decision to `common/` as a dumping ground.
- Do not delete or hide superseded ADR lineage unless the decisions README maps
  active successors and git history recovery is preserved.
- Do not duplicate root workflow rules here; link back to root AGENTS instead.
