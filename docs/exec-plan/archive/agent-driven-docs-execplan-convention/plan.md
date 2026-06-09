---
slug: agent-driven-docs-execplan-convention
title: "Agent-Driven Docs Structure & exec-plan Lifecycle Convention — Rollout Plan"
type: plan
date: 2026-06-08
owner: gobeumsu
created-from-spec: agent-driven-docs-execplan-convention/spec.md
status: done
---
<!-- NOTE: plan body is immutable after finalize.
     Finalize = the first git commit that includes this plan.md in docs/exec-plan/active/.
     Scope change -> create a new slug, then set:
       status: superseded-by
       superseded-by: {new-slug}
     Only the frontmatter status line(s) are mutable post-finalize. -->

## Requirements Summary

The project lacked a stable, agent-reproducible location for implementation plans. Three different
tool families (omc, omo, omx) wrote plan artifacts to separate scratch directories; no canonical
store existed. The deep-interview output went to `.omc/specs/` with no lifecycle management.

This rollout establishes:

1. `docs/exec-plan/active/` and `docs/exec-plan/archive/` as the only git-canonical plan store.
2. A slug convention (kebab, no date prefix, no issue numbers; folder name is authoritative).
3. A two-field frontmatter schema with an immutability rule and archive-only status lines.
4. AGENTS.md as the single-source convention router readable by every agent runtime.
5. A plan-vs-ADR boundary section in the `documentation-and-adrs` skill to prevent conflation.
6. The dogfood artifact (this spec + plan) as living proof of the convention in action.

Bulk-migration of other features' scattered `.omo/plans/` and `.omx/plans/` artifacts was
**DEFERRED** for concurrency safety — multiple feature branches are active simultaneously and a
mass-move risks merge conflicts. See `docs/exec-plan/MIGRATION.md` for the deferred migration guide
once the convention is stable and all feature branches have merged.

## Acceptance Criteria

Each criterion below is a testable file-existence or file-content check.

| # | Check | Pass condition |
|---|-------|---------------|
| AC-1 | `docs/exec-plan/active/` exists | `test -d docs/exec-plan/active` exits 0 |
| AC-2 | `docs/exec-plan/archive/` exists | `test -d docs/exec-plan/archive` exits 0 |
| AC-3 | `docs/exec-plan/README.md` exists and describes layout | file contains the words `active` and `archive` and `slug` |
| AC-4 | `AGENTS.md` contains ontology table | file contains `spec \| plan \| ADR` row |
| AC-5 | `AGENTS.md` contains lifecycle diagram | file contains `deep-interview` and `archive` in an ASCII-art block |
| AC-6 | `AGENTS.md` contains locations table | file lists `docs/exec-plan/active` and `docs/decisions` |
| AC-7 | Project-level `.claude/CLAUDE.md` has AGENTS.md pointer | file contains text `AGENTS.md` |
| AC-8 | `documentation-and-adrs` SKILL.md in `.claude` mirror has boundary section | file contains `## Boundary: plan vs ADR` |
| AC-9 | `documentation-and-adrs` SKILL.md in `.agents` mirror has boundary section | file contains `## Boundary: plan vs ADR` |
| AC-10 | Dogfood spec exists at correct path | `test -f docs/exec-plan/active/agent-driven-docs-execplan-convention/spec.md` exits 0 |
| AC-11 | Dogfood plan exists at correct path | `test -f docs/exec-plan/active/agent-driven-docs-execplan-convention/plan.md` exits 0 |
| AC-12 | spec.md frontmatter slug matches folder name | `slug: agent-driven-docs-execplan-convention` appears in spec.md |
| AC-13 | plan.md frontmatter slug matches folder name | `slug: agent-driven-docs-execplan-convention` appears in plan.md |
| AC-14 | plan.md contains immutability comment | `<!-- NOTE: plan body is immutable` appears in plan.md |

## Implementation Steps

### Component A — `docs/exec-plan/` store

**Files:**
- `docs/exec-plan/active/` — directory (create if absent)
- `docs/exec-plan/archive/` — directory (create if absent)
- `docs/exec-plan/README.md` — layout explanation, slug convention, frontmatter schema,
  lifecycle sentence, exec-plan vs docs/decisions comparison table, trivial-exemption list

**Done when:** AC-1, AC-2, AC-3 pass.

### Component B — Dogfood artifact (this spec + plan)

**Files:**
- `docs/exec-plan/active/agent-driven-docs-execplan-convention/spec.md` — copy of approved spec,
  slug updated to `agent-driven-docs-execplan-convention` (folder is authoritative per convention)
- `docs/exec-plan/active/agent-driven-docs-execplan-convention/plan.md` — this file

The source scratch file was at `.omc/specs/deep-interview-agent-driven-docs-execplan-convention.md`.
Per the lifecycle, that scratch file is deleted after promotion; it is not git-canonical.

**Done when:** AC-10, AC-11, AC-12, AC-13, AC-14 pass.

### Component C — AGENTS.md single-source router

**File:** `AGENTS.md` (project root)

Required sections:
- Waypoint tree (full directory map of runtime entry files and convention stores)
- Artifact Ontology table (`spec / plan / ADR` with non-overlapping questions, lifespans, locations)
- Lifecycle ASCII diagram (deep-interview → `.omc/specs/` → `active/{slug}/spec.md` → `plan.md`
  → execute → `archive/{slug}/` → optional ADR distill)
- Locations table (active, archive, decisions, scratch stores; git-canonical flag per row)
- Conventions block: plan-first mandate, trivial exemptions, plan immutability rule, archive trigger,
  slug naming rule, supersede timing rule, skill mirrors list

**Done when:** AC-4, AC-5, AC-6 pass.

### Component D — `documentation-and-adrs` SKILL.md boundary section

**Files** (same content in all mirrors):
- `.claude/skills/documentation-and-adrs/SKILL.md`
- `.agents/skills/documentation-and-adrs/SKILL.md`
- `.codex/skills/documentation-and-adrs/SKILL.md` (symlinked to `.agents` — update the source)

Insert after the existing "ADR Lifecycle" subsection:

```
## Boundary: plan vs ADR

Plans and ADRs answer different questions with different lifespans.
[table of differences]

### Distill rule
When a plan contains a cross-cutting, expensive-to-reverse choice, distill it into a new ADR
before or at archive time. The plan entry is not replaced; the ADR lives alongside it.

### Do NOT write an ADR for
- Implementation steps or file-level details (those belong in the plan)
- Choices revisited within the same work item
- Trivial configuration with no architectural consequence
```

**Done when:** AC-8, AC-9 pass.

## Risks / Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Concurrent branches write new `.omo/plans/` or `.omx/plans/` during rollout | High | Low | Scratch directories remain valid during transition; bulk-migration deferred to MIGRATION.md |
| A duplicate dogfood folder (shorter `agent-docs-execplan-convention` slug) was created during rollout | Low | Low | Resolved: duplicate removed; `agent-driven-docs-execplan-convention` is the single canonical dogfood. README and AGENTS.md examples reference it |
| plan.md modified after finalize (body mutation) | Low | Medium | Immutability is convention-enforced; the frontmatter comment is the guard. No hook this cycle |
| `.omc/specs/` source deleted before plan is written | Low | Low | Source is scratch; canonical version is `spec.md` in `active/`. Loss of scratch is expected and acceptable |
| MIGRATION.md not created before agents attempt bulk-migration | Medium | Medium | Plan explicitly defers migration; MIGRATION.md must be created (separate work item) before any bulk-move action is taken |

## Verification Steps

Run these checks from the project root after execution to confirm the rollout is complete.

```bash
# AC-1, AC-2: directories exist
test -d docs/exec-plan/active && echo "PASS active" || echo "FAIL active"
test -d docs/exec-plan/archive && echo "PASS archive" || echo "FAIL archive"

# AC-3: README exists and contains required words
grep -q 'active' docs/exec-plan/README.md && \
grep -q 'archive' docs/exec-plan/README.md && \
grep -q 'slug' docs/exec-plan/README.md && echo "PASS README" || echo "FAIL README"

# AC-4, AC-5, AC-6: AGENTS.md sections
grep -q 'spec' AGENTS.md && grep -q 'ADR' AGENTS.md && echo "PASS ontology table" || echo "FAIL ontology table"
grep -q 'deep-interview' AGENTS.md && grep -q 'archive' AGENTS.md && echo "PASS lifecycle diagram" || echo "FAIL lifecycle diagram"
grep -q 'docs/exec-plan/active' AGENTS.md && grep -q 'docs/decisions' AGENTS.md && echo "PASS locations" || echo "FAIL locations"

# AC-7: project CLAUDE.md pointer
grep -q 'AGENTS.md' .claude/CLAUDE.md && echo "PASS CLAUDE.md pointer" || echo "FAIL CLAUDE.md pointer"

# AC-8, AC-9: SKILL.md boundary section
grep -q 'Boundary: plan vs ADR' .claude/skills/documentation-and-adrs/SKILL.md && echo "PASS .claude skill" || echo "FAIL .claude skill"
grep -q 'Boundary: plan vs ADR' .agents/skills/documentation-and-adrs/SKILL.md && echo "PASS .agents skill" || echo "FAIL .agents skill"

# AC-10 through AC-14: dogfood artifact
test -f docs/exec-plan/active/agent-driven-docs-execplan-convention/spec.md && echo "PASS spec exists" || echo "FAIL spec exists"
test -f docs/exec-plan/active/agent-driven-docs-execplan-convention/plan.md && echo "PASS plan exists" || echo "FAIL plan exists"
grep -q 'slug: agent-driven-docs-execplan-convention' docs/exec-plan/active/agent-driven-docs-execplan-convention/spec.md && echo "PASS spec slug" || echo "FAIL spec slug"
grep -q 'slug: agent-driven-docs-execplan-convention' docs/exec-plan/active/agent-driven-docs-execplan-convention/plan.md && echo "PASS plan slug" || echo "FAIL plan slug"
grep -q 'plan body is immutable' docs/exec-plan/active/agent-driven-docs-execplan-convention/plan.md && echo "PASS immutability comment" || echo "FAIL immutability comment"
```
