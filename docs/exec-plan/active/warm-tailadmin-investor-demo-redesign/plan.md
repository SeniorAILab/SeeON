---
slug: warm-tailadmin-investor-demo-redesign
status: active
author: gobeumsu
created: 2026-06-18
---

# Warm TailAdmin-style redesign of the investor demo frontend (PR #246)

## Why
The demo frontend (`front/`, PR #246 backend-free investor demo) is a dark
slate-950 + cyan top-nav dashboard. Target: a **warm, light, TailAdmin-style**
admin UI (sidebar + topbar + KPI cards + charts + tables) adapted to the
eldercare fall-detection domain (행복한요양원 녹양역), mood = 따뜻한 돌봄형.
Reference mockup delivered in Claude Design (warm coral palette, Pretendard).
ui-skills (ibelick) `baseline-ui` rules apply.

## Architecture decision
Today only `(dashboard)/` has a layout (covers just `/dashboard`); every other
authenticated route carries its own `min-h-screen bg-slate-950` wrapper and has
no shared chrome. → **Co-locate all authenticated routes under `(dashboard)/`**
so one warm Sidebar+Topbar shell covers them. URLs unchanged (route group).
`login` + `onboarding` stay outside the shell.

## Design tokens (Tailwind v4 `@theme`, in globals.css)
canvas #FBF7F3 · surface #FFFFFF · surface-2 #FDFBF9 · ink #28211C · ink-2 #5C534B
· muted #968C82 · line #EFE7DE · brand #F2784B · brand-ink #C9532A · brand-weak
#FFEDE4 · ok #2E9E7B (+weak) · warn #E0A11B (+weak) · danger #E04848 (+weak).
Font: Pretendard. Default Tailwind shadows. One accent (brand) per view.

## Dark→warm class mapping (sweep contract)
- `bg-slate-950` (page) → drop (shell owns bg) / `bg-canvas`
- `bg-white/5`,`bg-slate-900/*` (card) → `bg-surface` `border border-line`
- `border-white/5`,`border-white/10` → `border-line`
- `text-white` → `text-ink` · `text-slate-300/400` → `text-ink-2` · `text-slate-500` → `text-muted`
- `text-cyan-400` (eyebrow/accent) → `text-brand`
- `bg-cyan-700` (primary btn) → `bg-brand hover:bg-brand-ink text-white`
- `text-red-400` → `text-danger` · `text-amber-400` → `text-warn` · emerald → `ok`
- `shadow-xl shadow-slate-950/20` → `shadow-sm`
- numbers → `tabular-nums`; headings `text-balance`; body `text-pretty`

## Phases
0. **Tokens + fonts** (globals.css, root layout) — done in main context.
1. **Shell** — Sidebar.tsx + Topbar.tsx; rewrite `(dashboard)/layout.tsx`;
   `git mv` alerts/admin/monitoring/reports/settings into `(dashboard)/`; retire AppNav.
2. **Shared components** — StatusBadge, AlertFeed, PoseFrameCard, EmptyState,
   RoleSwitcher, SnapshotThumb → tokens. (parallel)
3. **Page sweeps** — dashboard(hero+KPI+charts), alerts(+[id]), admin/*,
   monitoring, reports, settings/*, login, onboarding. (parallel fan-out)
4. **Verify + launch** — typecheck/lint/build, start on :3100.

## Out of scope
Backend, demo fixtures/wiring logic, route URLs, new deps (use installed only).
