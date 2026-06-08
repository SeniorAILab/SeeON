---
slug: agent-driven-docs-execplan-convention
title: "Agent-Driven Docs Structure & exec-plan Lifecycle Convention"
type: spec
date: 2026-06-08
interview-id: di-agent-docs-execplan-2026-06-08
ambiguity: 4%        # threshold 5% — PASSED (5 rounds)
---

> Crystallized from a deep-interview (`--quick`, 5 rounds, ambiguity 4%). The original
> `.omc/specs/` scratch source was consumed on promotion (scratch is not git-canonical);
> this file is the canonical, self-contained spec.

## Goal

Establish a single, agent-reproducible convention so the deep-interview → plan →
autonomous-execution cycle always produces the same artifact layout. Consolidate all plan
outputs into `docs/exec-plan/` (two-bucket active/archive where lifecycle = folder position),
make `AGENTS.md` the single source of truth router for every runtime, and add a plan-vs-ADR
boundary to the `documentation-and-adrs` skill so agents never conflate the two artifact types.

## Artifact Ontology (locked)

Three artifact types with non-overlapping responsibilities:

| Artifact | Question answered | Lifespan | Author | Canonical location |
|----------|-------------------|----------|--------|--------------------|
| **spec** | *What* is this work / are requirements clear? | Work-scoped, one-shot | deep-interview | `docs/exec-plan/active/{slug}/spec.md` |
| **plan** | *How* to implement (steps, files, order) | Work-scoped, body immutable; lifecycle = folder position | omc-plan / omo / omx | `docs/exec-plan/active/{slug}/plan.md` |
| **ADR** | One cross-cutting, expensive-to-reverse decision constraining all future plans | Work-independent, permanent (superseded only) | documentation-and-adrs | `docs/decisions/ADR-NNN-*.md` |

**Key principle:** plan ≠ ADR. A plan is archived when its work ends; a cross-cutting choice made
inside a plan is *distilled* into a new ADR — the plan entry is not replaced.

## Plan invariants (locked)

- **plan-first:** every *meaningful* change has an `active/{slug}/` entry before any code changes.
- **lifecycle = folder position:** `active/{slug}/` → `archive/{slug}/` is the only state transition;
  the move is the signal, not a status enum scattered across stores.
- **immutable after finalize:** finalize = first git commit including `plan.md`. Post-finalize only
  the `status` / `superseded-by` frontmatter lines are mutable; scope change → new slug.
- **trivial exemptions:** typo/comment/doc-wording fixes, lint/format-only, dependency patch bumps,
  behavior-preserving renames — no plan required.

## Acceptance Criteria

- [x] `docs/exec-plan/active/` + `docs/exec-plan/archive/` created with README explaining the two-bucket layout
- [x] `AGENTS.md` rewritten as single-source router (ontology table + lifecycle diagram + locations + conventions)
- [x] Runtime entry points (`.claude/CLAUDE.md`, `.agents/AGENTS.md`, `.codex/AGENTS.md`) carry the `@../AGENTS.md` autoload pointer — no content duplication
- [x] `documentation-and-adrs` SKILL.md gains a "Boundary: plan vs ADR" section in all runtime mirrors
- [x] Dogfood artifact (this spec + companion plan.md) lives under `active/agent-driven-docs-execplan-convention/` as convention case #1
- [x] plan/spec frontmatter schema documented with archive-only status line and immutability note
- [x] MIGRATION.md catalogs existing scattered `.omc`/`.omo`/`.omx` plan outputs with recommended dest/status (recommendation-only — no physical move while concurrent code work is in flight)

## Constraints

- deep-interview writes specs to `.omc/specs/` (hardcoded); the first planning act moves the spec here. `.omc/specs/` is scratch — not git canonical, and may be deleted after promotion.
- `.omc/plans/`, `.omo/plans/`, `.omx/plans/` remain tool scratch — not git canonical.
- plan body immutable after finalize; scope change creates a new slug + `superseded-by`.
- ADRs in `docs/decisions/` are never moved or deleted — superseded only.
- Enforcement is convention-level only (no hook-based hard gate this cycle).
- Isolation: this work touches docs/process files only; concurrent agents own the `ml/**` code — no code edits, no shared-file contention.

## Non-Goals

- No automation this cycle: no git hooks, merge triggers, or CI gates enforcing plan-first.
- No physical migration of existing scattered plans — MIGRATION.md is recommendation-only.
- No change to how deep-interview / omc-plan tools write their scratch output.
- No new ADRs authored as part of this convention work (the convention defines *when* to write one).

## Assumptions

- The active/archive folder MOVE is performed manually by an agent at work boundaries; no tooling detects drift.
- macOS APFS is case-insensitive, so `AGENTS.md` and `agents.md` are the same file (single physical source).
- Runtime hosts (Claude Code, Codex, agents) honor `@path` autoload import syntax relative to the importing file.
