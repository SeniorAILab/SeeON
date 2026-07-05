# Senior AI Lab Design System

## 1. Atmosphere & Identity

Senior AI Lab is a calm operational safety console for eldercare facilities. It
must feel dependable, legible, and immediate: quiet enough for repeated daily
use by directors, but large and direct enough for caregivers checking rooms
under time pressure. The signature is dual-mode clarity: a compact admin
dashboard for configuration and review, paired with high-readability staff and
monitor surfaces for live care workflows.

## 2. Color

### Palette

The implementation source of truth is `front/src/index.css`; Tailwind aliases
are declared in `front/tailwind.config.js`.

Tone direction: Threads-style neutral. Component surfaces, backgrounds, and
text are achromatic (no navy/blue tint) in both modes — light runs on a pure
white family, dark runs on pure near-black/dark-gray. Status colors (stable,
caution, danger, check) are the **only** chroma allowed on these surfaces.
Brand blue survives strictly as an interactive-only accent (primary buttons,
active nav/tabs, focus rings) and must not be used decoratively.

| Role | Token | Light | Dark | Tailwind alias | Usage |
|------|-------|-------|------|----------------|-------|
| Surface/page | `--c-bg` | `#FAFAFA` | `#101010` | `bg-bg` | App canvas, staff mode background |
| Surface/primary | `--c-surface` | `#FFFFFF` | `#1A1A1A` | `bg-surface` | Cards, sidebars, headers, sheets |
| Surface/secondary | `--c-surface-2` | `#F0F0F0` | `#242424` | `bg-surface2` | Nested panels, subtle hover fills |
| Border/default | `--c-border` | `#E0E0E0` | `#333333` | `border-border` | Card borders, dividers, tab lines |
| Text/primary | `--c-ink` | `#0F0F0F` | `#F5F5F5` | `text-ink` | Headings, primary values, body |
| Text/secondary | `--c-ink-soft` | `#595959` | `#B3B3B3` | `text-ink-soft` | Secondary labels, button text |
| Text/tertiary | `--c-ink-faint` | `#8A8A8A` | `#808080` | `text-ink-faint` | Metadata, muted icons, timestamps |
| Accent/primary (interactive-only) | `--c-brand` | `#2F6FB0` | `#4D97E0` | `bg-brand`, `text-brand` | Primary actions, active nav, focus — never decorative |
| Accent/soft | `--c-brand-soft` | `#EAF2FB` | `#1D2C40` | `bg-brand-soft` | Active nav fill, accent chips (interactive state only) |
| Accent/teal | `--c-teal` | `#2BB6A3` | `#3FD3BD` | `text-teal`, `bg-teal` | Secondary positive accent |
| Status/stable | `--c-stable` | `#166E3D` | `#45D07F` | `status-stable` | Stable state, success actions |
| Status/stable bg | `--c-stable-bg` | `#E7F7EE` | `#14301F` | `status-stableBg` | Stable chips and panels |
| Status/caution | `--c-caution` | `#884E07` | `#F7B733` | `status-caution` | Caution state |
| Status/caution bg | `--c-caution-bg` | `#FDF2DF` | `#3A2B0B` | `status-cautionBg` | Caution chips and panels |
| Status/danger | `--c-danger` | `#B8261B` | `#FF6B5E` | `status-danger` | Fall risk, emergency, destructive |
| Status/danger bg | `--c-danger-bg` | `#FDECEB` | `#3C1714` | `status-dangerBg` | Danger chips and panels |
| Status/check | `--c-check` | `#1554E0` | `#5FA3F7` | `status-check` | Check-needed state |
| Status/check bg | `--c-check-bg` | `#E8F0FE` | `#15243B` | `status-checkBg` | Check-needed chips and panels |

Light-mode status colors were darkened from the previous palette (e.g.
`--c-stable` `#1F9D57` → `#166E3D`) so status-on-status-bg text pairs still
clear 4.5:1 against the new neutral surfaces; dark-mode status colors are
unchanged. See `front/src/lib/contrast.ts` (`contrastRatio`) and
`front/src/lib/contrast.test.ts` for the enforced ratios per token pair.

### Rules

- Use semantic Tailwind aliases (`bg-surface`, `text-ink`, `status-danger`) before raw palette classes.
- Staff and monitor surfaces support dark mode through `.dark`; admin surfaces remove `.dark` and stay light.
- Component surfaces/backgrounds/text stay neutral (no navy or blue tint). Status colors are the only chroma allowed on those surfaces; use them only for state, risk, or action feedback, never decoratively.
- Brand blue is reserved for primary actions, active navigation, and focus. Do not use it as background decoration.
- Existing raw `gray-*`, `black/*`, and one-off hex values are legacy deviations. New code should either use tokens or extend this table first.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Tailwind / usage |
|-------|------|--------|-------------|----------|------------------|
| Monitor/hero value | `4.5rem`-`6rem` | 900 | tight | 0 | Large people counts on wall displays |
| Monitor/title | `3rem`-`4.5rem` | 800 | tight | 0 | Large room names and emergency cards |
| Staff/name | `1.75rem` / 28px | 700 | `2.1rem` | 0 | `text-staff-name`, room name |
| Staff/status | `1.5rem` / 24px | 700 | `1.9rem` | 0 | `text-staff-status`, care status |
| Staff/button | `1.3rem` / ~21px | 700 | `1.4rem` | 0 | `text-staff-btn`, primary staff actions |
| Staff/body | `1.2rem` / ~19px | 400-700 | `1.7rem` | 0 | `text-staff-body`, explanations |
| Page title | `1.25rem` / 20px | 700 | normal | 0 | Admin page headers |
| Body | `1rem` / 16px | 400-700 | normal | 0 | Default UI text |
| Body/sm | `0.875rem` / 14px | 400-700 | normal | 0 | Admin labels, nav, descriptions |
| Caption | `0.75rem` / 12px | 500-700 | normal | 0 | Badges, metadata |
| Micro caption | `0.6875rem` / 11px | 500-700 | normal | 0 | Compact chips and sidebar metadata |

### Font Stack

- Primary: `Pretendard`, `-apple-system`, `BlinkMacSystemFont`, `system-ui`, `Apple SD Gothic Neo`, `Noto Sans KR`, `sans-serif`
- Mono: system monospace only when needed for tabular or technical values.

### Rules

- Body text should not go below 14px except micro captions and compact badges.
- Staff and monitor workflows use larger type than admin pages because they are used under motion, distance, gloves, and urgent conditions.
- Use `tabular-nums` for counts, dates, and operational metrics.
- Letter spacing remains `0`; do not introduce negative tracking.

## 4. Spacing & Layout

### Base Unit

All spacing derives from Tailwind's 4px base scale.

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| Space/1 | 4px | `1` | Tight icon/text gaps, hairline offsets |
| Space/1.5 | 6px | `1.5` | Compact chip padding |
| Space/2 | 8px | `2` | Inline controls, small button gaps |
| Space/2.5 | 10px | `2.5` | Icon button padding, compact cards |
| Space/3 | 12px | `3` | Nav item padding, form rhythm |
| Space/4 | 16px | `4` | Default card padding, page gutters |
| Space/5 | 20px | `5` | Staff card vertical rhythm |
| Space/6 | 24px | `6` | Modal/sheet padding, large buttons |
| Space/8 | 32px | `8` | Staff confirmation sections |
| Space/10 | 40px | `10` | Large section breaks |

### Grid

- Staff content width: `max-w-5xl`, centered.
- Admin shell: fixed 256px sidebar (`w-64`) plus flexible main region.
- Mobile: staff and admin actions collapse by wrapping rather than truncating critical controls.
- Breakpoints follow Tailwind defaults: `sm 640px`, `md 768px`, `lg 1024px`, `xl 1280px`, `2xl 1536px`.

### Rules

- Keep fixed-format operational elements dimensionally stable: buttons, room cards, monitor tiles, counters, and nav tabs should not resize because of hover or state changes. **Exception:** monitor room tiles in the floor grid MAY grid-span-expand when a room enters an emergency (danger/check-needed) state, so the at-risk room reads as unmistakably larger. This resize is span-only (never a hover/idle-state resize) and must transition via FLIP (`transform`/`scale`) only, per the Motion & Interaction rules below.
- Staff primary actions use at least 52-56px height for large touch targets.
- Admin pages favor dense but readable spacing; avoid marketing-style section spacing.
- Use responsive wrapping and truncation for labels; do not let text overlap controls.

## 5. Components

### Admin App Shell

- **Structure**: `AppLayout` with fixed sidebar, sticky topbar, facility selector, and routed main content.
- **Variants**: desktop sidebar, mobile drawer.
- **Spacing**: sidebar `w-64`, header `h-16`, main `p-4 lg:p-6`.
- **States**: active nav uses `bg-brand-soft text-brand`; inactive nav uses `text-ink-soft` with surface hover.
- **Accessibility**: nav items are links; drawer toggle is a button.
- **Motion**: sidebar uses transform transition only.

### Staff Shell

- **Structure**: `StaffLayout` with sticky header, three primary tabs, sound/theme/monitor/admin/logout controls.
- **Variants**: light and dark mode; admin button appears only for `FACILITY_ADMIN` and `SUPER_ADMIN`.
- **Spacing**: centered `max-w-5xl`, header `px-4 py-3`, tabs `px-3 py-3`.
- **States**: active tab uses brand text and bottom border; inactive tabs use muted text.
- **Accessibility**: icon-only controls carry `aria-label` and `title`.
- **Motion**: color transitions only.

### Card Surface

- **Structure**: bordered rounded panel on `bg-surface`.
- **Variants**: default card, staff card, monitor tile, danger/caution state panel.
- **Spacing**: default `p-4`, large staff/monitor cards `p-5` through `p-8`.
- **States**: risk cards use semantic border/background plus optional pulse.
- **Accessibility**: status must be communicated by text/icon, not color alone.
- **Motion**: hover scale is allowed for monitor cards; emergency pulse uses shadow animation.

### Status Badge

- **Structure**: inline-flex chip with optional dot/icon and semantic label.
- **Variants**: stable, caution, danger, check-needed, Kakao send states.
- **Spacing**: `gap-1` to `gap-2`, `px-2` to `px-4`, `py-0.5` to `py-2`.
- **States**: semantic background + foreground pairs from Section 2.
- **Accessibility**: label text is required; icon-only badges are not allowed.
- **Motion**: none.

### Primary Button

- **Structure**: inline-flex button with icon and label when space allows.
- **Variants**: primary brand, secondary bordered, ghost, danger, subtle.
- **Spacing**: admin height `h-8` or `h-10`; staff action min height `52-56px`.
- **States**: hover, disabled opacity, visible focus ring.
- **Accessibility**: icon-only buttons require `aria-label`.
- **Motion**: color transitions and active transform only.

### Bottom Sheet / Modal

- **Structure**: fixed overlay plus elevated `bg-surface` panel.
- **Variants**: mobile bottom sheet, desktop rounded modal.
- **Spacing**: `p-6`, rounded top corners on mobile and full radius on desktop.
- **States**: overlay click closes where safe; loading/done states replace content.
- **Accessibility**: close button has label; future modal work should add focus trapping.
- **Motion**: transform/opacity only.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 100-150ms | ease-out | Button press, active scale |
| Standard | 150-250ms | ease-in-out | Color changes, sidebar transform |
| Alert pulse | 1800ms | ease-in-out | Danger attention pulse |

### Rules

- Animate `transform`, `opacity`, color, and shadow only. Do not animate layout properties.
- Every button and nav item must have hover/focus feedback.
- Danger pulse is reserved for active caution/danger surfaces; do not use it decoratively.
- Respect large touch targets in staff mode before adding extra controls.

## 7. Depth & Surface

### Strategy

Use a mixed strategy: borders define most operational surfaces, subtle shadows
differentiate cards and elevated panels, and tonal shifts separate nested staff
and admin areas.

| Level | Token / Value | Usage |
|-------|---------------|-------|
| Border/default | `1px solid var(--c-border)` | Cards, sidebars, dividers, controls |
| Shadow/card | `0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)` | Cards at rest |
| Shadow/cardDark | `0 1px 2px rgba(0,0,0,0.3)` | Dark staff cards |
| Shadow/panel | `0 -8px 24px rgba(16,24,40,0.12)` | Bottom sheets and panels |
| Overlay | `rgba(0,0,0,0.30-0.50)` | Mobile nav and modal backdrops |

### Rules

- Admin surfaces should remain quiet: borders and light shadows, no heavy depth.
- Staff and monitor danger states can use heavier borders, semantic fills, and pulse to support urgency.
- Do not nest cards inside cards for layout decoration. Use nested tonal panels only when they group operational detail.
- Rounded corners should usually be `8px` to `16px`; large `24px+` radii are reserved for staff/monitor cards and bottom sheets.

## Known Deviations To Consolidate

- Some components still use raw Tailwind neutrals such as `text-gray-400`, `bg-gray-100`, and `bg-black/30`.
- Some compact sizes use arbitrary Tailwind values such as `text-[11px]`, `h-[18px]`, and `min-h-[56px]`.
- `LoginPage` contains Kakao brand colors and a light gradient. Those are allowed as provider/entry-screen specifics, but should not become general app tokens.
