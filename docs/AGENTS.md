# Docs agent rules - research, plans, decisions, rules

## Overview
`docs/**` is the canonical knowledge surface. It separates facts found,
decisions made, work plans, standing rules, and wire-contract rules.

## Where to look

| Task | Location | Notes |
| --- | --- | --- |
| Architecture map | `architecture.md` | System-level overview for edge/backend/frontend flow. |
| Tooling notes | `Tools.md` | MCP and operator tooling notes. |
| Wire contracts | code + `/api/docs`, `rules/rest-api-convention.md`, `rules/realtime-sse-convention.md`, `rules/dto-convention.md` | Backend/ML/frontend contract SSOT; no hand-maintained `api/` or domain docs. |
| Work plans | `exec-plan/` | Active/archive lifecycle for specs and plans. |
| Retired reference | `archive/` | 은퇴 참고문서 보관소 — preserved, non-normative historical docs; distinct from `exec-plan/archive/` work plans. |
| Decisions | `decisions/` | ADR home after reset; current backend doctrine is in `decisions/backend/adr-post-mvp-auth-rbac-ml-ingest-seed.md`. |
| Evidence | `research/` | Findings and source comparisons before decisions. |
| Standing rules | `rules/` | Ongoing conventions that apply beyond one work item. |
| Operations | `scripts/`, `research/` | DB backup/restore in `scripts/db-backup.sh`; deploy/bootstrap in `scripts/deploy/`; camera RTSP in `research/`. |

## Conventions

- Keep artifact responsibilities separate:
  - `research/` says what was found.
  - `decisions/` is the ADR home after reset; use `decisions/backend/adr-post-mvp-auth-rbac-ml-ingest-seed.md` for the post-MVP auth/RBAC/ML ingest/seed doctrine.
  - `exec-plan/` says how one work item is implemented.
  - `rules/` says what ongoing convention every future change must follow.
- Plans live in `exec-plan/active/{slug}/` while work is active and move as a whole folder to `exec-plan/archive/{slug}/` when done, discarded, or superseded.
- `docs/archive/` stores retired reference documents (preserved but non-normative); keep it distinct from `docs/exec-plan/archive/`, which stores completed or superseded work-plan folders.
- Plan slug is authoritative from the folder name. Frontmatter `slug` must match it exactly.
- Cross-cutting, expensive-to-reverse decisions may be recorded as normal ADR files under `decisions/{backend,frontend,ml,common}/`.
- Rules are the durable place for ongoing operational constraints. Keep each rule focused on what to do, and keep rationale short.
- ADR-level notes should be short: current rule, why it exists, rejected alternatives, and where it is enforced. Leave historical detail in git history unless the ADR explicitly records a disposition.
- Do not hard-wrap prose mid-sentence just to fit a terminal width. Use line breaks for semantic structure: headings, bullets, tables, code blocks, and paragraph breaks.
- Operational procedures live with their scripts (`scripts/**` headers and `scripts/deploy/AGENTS.md`) and as findings in `research/`, not in a separate runbooks tree.
- Screenshots are evidence artifacts, not design authority.

## Anti-patterns

- Do not let a research doc assert a decision.
- Do not bury an expensive-to-reverse choice inside a plan. Move the current rule to the ADR README or the owning operational document.
- Do not edit finalized plan bodies. Only archive-status frontmatter changes are mutable after finalization.
- Do not recreate deleted `ADR-NNN-*.md` files, retired stubs, or an ADR archive.
- Do not duplicate historical rationale when git history is enough.
- Do not duplicate root workflow rules here; link back to root AGENTS instead.
