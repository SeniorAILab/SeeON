# Senior AI Lab Frontend Design System

## 1. Atmosphere & Identity

Senior AI Lab is a calm care-operations command center. The signature is quiet clinical clarity: soft surfaces, restrained blue action color, high Korean readability, and enough spacing for staff using the dashboard repeatedly during care work.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Background | `--c-bg` | `#f4f6f9` | `#0e1620` | Page background |
| Surface | `--c-surface` | `#ffffff` | `#18222f` | Cards, primary panels |
| Surface/secondary | `--c-surface-2` | `#f8fafc` | `#202c3b` | Secondary controls and hover states |
| Border | `--c-border` | `#e2e6ec` | `#2b3a4d` | Cards, inputs, dividers |
| Text/primary | `--c-ink` | `#15233b` | `#f1f5fa` | Main text |
| Text/secondary | `--c-ink-soft` | `#51607a` | `#aab8cc` | Labels and helper text |
| Text/faint | `--c-ink-faint` | `#8593a8` | `#7488a0` | Metadata and low-priority help |
| Brand/action | `--c-brand` | `#2f6fb0` | `#4d97e0` | Primary actions, focus, links |
| Brand/soft | `--c-brand-soft` | `#eaf2fb` | `#1d2c40` | Subtle action background |
| Teal/accent | `--c-teal` | `#2bb6a3` | `#3fd3bd` | Secondary accent |
| Status/success | `--c-stable` | `#1f9d57` | `#45d07f` | Stable state |
| Status/warning | `--c-caution` | `#c2700a` | `#f7b733` | Caution state |
| Status/error | `--c-danger` | `#d92d20` | `#ff6b5e` | Errors and destructive states |
| Status/info | `--c-check` | `#2563eb` | `#5fa3f7` | Check/info state |

### Rules

- Use token-backed Tailwind colors (`bg`, `surface`, `surface2`, `border`, `ink`, `brand`, `status`) before raw colors.
- Brand blue is for actions, links, and focus states.
- Status colors must pair text with their matching background token where possible.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|---|---:|---:|---:|---:|---|
| Page title | 20px | 700 | 1.4 | 0 | Auth and compact page headings |
| Section title | 18px | 700 | 1.4 | 0 | Card headings |
| Body | 14px | 400 | 1.5 | 0 | Default dashboard and form text |
| Caption | 12px | 400-500 | 1.4 | 0 | Helper text and fine print |
| Staff/name | 28px | 700 | 2.1rem | 0 | Staff-facing room names |
| Staff/status | 24px | 700 | 1.9rem | 0 | Staff-facing status text |
| Staff/body | 19px | 400 | 1.7rem | 0 | Staff-facing explanatory text |

### Font Stack

- Primary: Pretendard, Apple system fonts, Apple SD Gothic Neo, Noto Sans KR, sans-serif.
- Body text should not go below 12px, and repeated operational text should stay at 14px or above.

## 4. Spacing & Layout

### Base Unit

All spacing derives from 4px.

| Token | Value | Usage |
|---|---:|---|
| `space-1` | 4px | Icon-to-label tight gaps |
| `space-2` | 8px | Compact inline groups |
| `space-3` | 12px | Input horizontal padding |
| `space-4` | 16px | Form rhythm |
| `space-5` | 20px | Compact section rhythm |
| `space-6` | 24px | Card padding |
| `space-8` | 32px | Group separation |

### Grid

- Auth forms use a centered single column with `max-w-md`.
- Dashboard pages use constrained content inside app/staff layouts.
- Full-height pages use `min-h-[100dvh]`, not `h-screen`.

## 5. Components

### Card

- **Structure**: bordered rounded container with surface background.
- **Variants**: default only.
- **Spacing**: `p-6` for auth cards; local page layouts may adjust.
- **States**: static.
- **Accessibility**: content must keep semantic headings inside the card.
- **Motion**: none by default.

### Button

- **Structure**: native `button` with inline-flex icon/text alignment.
- **Variants**: primary, secondary, ghost, danger, subtle.
- **Spacing**: `h-10 px-4` default, `h-8 px-3` small.
- **States**: hover, disabled, focus-visible ring.
- **Accessibility**: icon-only buttons need `aria-label` and `title`.
- **Motion**: color transitions only.

### Input

- **Structure**: native input with label supplied by `Field`.
- **Variants**: default text-like inputs.
- **Spacing**: `h-10 px-3`.
- **States**: focus border/ring, placeholder, invalid via ARIA and local error text.
- **Accessibility**: visible label or explicit `aria-label` required.
- **Motion**: none.

### Field

- **Structure**: label, control, optional hint/error text.
- **Variants**: default.
- **Spacing**: label margin `mb-1.5`; helper text `mt-1`.
- **States**: error text belongs near the control it explains.
- **Accessibility**: helper/error text should be connected with `aria-describedby` when actionable.
- **Motion**: none.

### Agreement Checkbox

- **Structure**: native checkbox with visible Korean label and short supporting copy.
- **Variants**: terms, privacy.
- **Spacing**: compact stacked rows inside a subtle surface.
- **States**: default, checked, focus-visible, disabled through parent form state.
- **Accessibility**: the checkbox label is the click target; `required` marks form obligation.
- **Motion**: color transition only.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | 150ms | ease-out | Button and checkbox color feedback |
| Standard | 200ms | ease-in-out | Panel or card transitions when present |

Rules:

- Animate color, opacity, and transform only.
- Every interactive control needs a visible focus state.
- Respect native form behavior and keyboard operation.

## 7. Depth & Surface

### Strategy

Mixed, with borders for structure and low-elevation shadows for cards.

| Level | Value | Usage |
|---|---|---|
| Card | `0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)` | Auth cards and dashboard cards |
| Panel | `0 -8px 24px rgba(16,24,40,0.12)` | Bottom panels and overlays |

Rules:

- Prefer border plus token surface before adding a new shadow.
- Auth surfaces stay compact and scannable; avoid nested cards.
