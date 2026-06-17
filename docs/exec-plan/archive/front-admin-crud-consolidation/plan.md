---
slug: front-admin-crud-consolidation
title: "Front — Admin CRUD Dedup + useCrud/AdminShell Consolidation — Execution Plan"
type: plan
date: 2026-06-17
owner: gobeumsu
issue: 202
status: done
---
<!-- NOTE: plan body is immutable after finalize (first commit including this file).
     Scope change -> new slug + status: superseded-by. -->

# Plan: Front Admin CRUD Dedup + useCrud/AdminShell Consolidation

Source: ponytail-review of `front/` (2026-06-17). Bulk + duplication is concentrated
in the three admin pages (residents/cameras/guardians = 1011 lines of near-identical
CRUD). Goal: cut future dev effort — a 4th admin entity becomes a config, not a copy-paste.
Split into two reviewable PRs per `docs/rules/pr-decomposition-and-review.md`.

## PR-A — Safe dedup / delete (behavior-preserving)

1. **Delete create-next-app boilerplate.** `app/page.tsx` (65 lines) → `redirect("/dashboard")`.
2. **Hoist shared formatters into `lib/sse-utils.ts`:** `formatTime(iso, opts?)` (replaces the
   4 inline `Intl.DateTimeFormat` copies in alerts/page, alerts/[id], cameras, AlertFeed) and
   `STATUS_LABELS` (dup in alerts/page + alerts/[id]).
3. **Shared `<EmptyState message>` component** (residents has one; cameras/guardians inline it).
4. **Shared `residentName(residents, id)` lookup** (dup in cameras + guardians).
5. **`proxy.ts`:** drop the redundant regex cookie check; keep `request.cookies.get("app_session")`.

Verification: `pnpm --filter front lint` + `pnpm --filter front build` green; no behavior change.

## PR-B — useCrud + AdminShell refactor

1. **`useCrud<T>(endpoint, opts)` hook** — owns list state, `load`, `create`, `save`, `delete`,
   and loading/error/saving/deleting flags. Replaces the ~13 useState + 3 handlers per page.
2. **`<AdminShell title>` layout wrapper** — header + admin nav + loading/error blocks.
3. **Collapse the 3 admin pages** to: entity config + create-form renderer + row renderer +
   edit-form renderer. Target ~1011 → ~500 lines.
4. **Vitest smoke test** `useCrud` — list/create/delete against a mocked `api`.

Verification: `pnpm --filter front test` (new useCrud smoke) + lint + build green;
manual: all three admin pages CRUD still work.

## Acceptance

- PR-A and PR-B each merge as `size/M`-or-smaller with review evidence.
- Net ~ -570 lines across the two PRs.
- No behavior regression in admin pages, alerts, or dashboard.

## Distill check

Behavior-preserving refactor; no expensive-to-reverse decision → no ADR expected.
If `useCrud` becomes a standing front convention, note it in `docs/rules/` (not an ADR).
