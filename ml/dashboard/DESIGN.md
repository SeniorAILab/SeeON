# ML Dashboard Design System

## 1. Atmosphere & Identity

The dashboard is a quiet edge operations console for care staff and engineers. It should feel immediate, dense, and trustworthy rather than decorative. The signature is a dark live-operations surface embedded inside light registry and system panels, so camera/event video work is visually distinct from setup work.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/page | `bg-indigo-50` / `#eef2ff` | `#eef2ff` | N/A | App background |
| Surface/panel | `white/55`, `white/85` | `rgba(255,255,255,.55-.85)` | N/A | Registry, header, settings panels |
| Surface/live | `slate-950` | `#020617` | `#020617` | Live camera/event workspace |
| Surface/live-muted | `white/10` | `rgba(255,255,255,.10)` | `rgba(255,255,255,.10)` | Live-panel cards and inactive controls |
| Text/primary | `slate-950` | `#020617` | `white` | Headings and selected controls |
| Text/secondary | `slate-500`, `slate-300` | `#64748b` | `#cbd5e1` | Metadata and helper text |
| Accent/primary | `indigo-600` | `#4f46e5` | `#818cf8` | Primary buttons, section labels |
| Accent/live | `emerald-300` | `#6ee7b7` | `#6ee7b7` | Stream available status |
| Status/error | `rose-500`, `rose-700` | `#be123c` | `#fecdd3` | Stream/API errors |
| Border/default | `white/10`, `indigo-200` | `#c7d2fe` | `rgba(255,255,255,.10)` | Live frame and empty-state outlines |

### Rules

- Live media surfaces use dark slate and restrained status colors.
- Light panels use translucent white over the page background.
- Accent colors indicate state or action only.
- No real camera IP, credential, token, or RTSP URL appears in UI examples.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| H1 | 36px | 900 | 1.15 | 0 | Page title on desktop |
| H2 | 24px | 900 | 1.25 | 0 | Panel title |
| H3 | 18px | 900 | 1.35 | 0 | Live panel title |
| Body | 16px | 700 | 1.5 | 0 | Operational copy |
| Body/sm | 14px | 700 | 1.5 | 0 | Errors, empty states, metadata |
| Caption | 12px | 900 | 1.35 | 0.18em max for uppercase labels | Labels and counters |

### Font Stack

- Primary: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
- Mono: system monospace only for endpoint labels

### Rules

- Compact panels use H2/H3 sizes; reserve 36px only for page headers.
- Body text should not go below 14px except short labels.
- Avoid negative letter spacing.

## 4. Spacing & Layout

### Base Unit

Spacing follows Tailwind's 4px scale.

| Token | Value | Usage |
| --- | --- | --- |
| `p-2` | 8px | Mobile nav shell |
| `gap-3`, `p-3` | 12px | Inline controls and camera tiles |
| `gap-4`, `p-4` | 16px | Live subpanels, errors, clip rows |
| `gap-5`, `p-5` | 20px | Primary dashboard panels |
| `gap-6`, `p-6` | 24px | Page sections and header panels |
| `p-8` | 32px | Large desktop page padding |

### Grid

- Max content width: `max-w-7xl`.
- Main dashboard: two-column desktop grid with the live/event workspace in the secondary column.
- Camera grid: responsive 1/2/3-column tile grid, stable minimum tile height.
- Live video: fixed `aspect-video`, object-contained, never cropped for decoration.

### Rules

- Camera tiles, event selectors, and live frames must keep stable dimensions when labels or status change.
- Page sections are full-width within their grid area; do not nest cards inside cards except repeated items and dialogs.

## 5. Components

### Dashboard Shell

- **Structure**: page background, desktop sidebar, header panel, mobile tab nav, active content area.
- **Variants**: desktop sidebar, mobile segmented nav.
- **Spacing**: `p-5` mobile, `p-8` desktop, `gap-6`.
- **States**: active navigation is high-contrast; hover uses subtle tonal shift.
- **Accessibility**: buttons use native button elements and visible text.
- **Motion**: no layout animation.

### Camera Tile Grid

- **Structure**: button tile with type label, camera label, and status.
- **Variants**: selected, idle, empty registry.
- **Spacing**: `min-h-24`, `px-4`, `py-3`, `gap-3`.
- **States**: selected tile becomes white with dark text; idle tiles remain dark translucent.
- **Accessibility**: each tile is keyboard-focusable and exposes the camera name.
- **Motion**: color transition only.

### Event Selector

- **Structure**: compact button row inside the live panel.
- **Variants**: selected event, idle event, no events.
- **Spacing**: `px-4`, `py-2`, `gap-2`.
- **States**: selected event is white/dark; idle event uses dark translucent hover.
- **Accessibility**: event buttons use readable Korean labels.
- **Motion**: color transition only.

### Live Stream Panel

- **Structure**: title/status header, event selector, `img` MJPEG stream or explicit empty/error state, selected camera summary.
- **Variants**: empty, loading-by-browser, live image, unavailable.
- **Spacing**: `p-4`, `mt-4`, `aspect-video`.
- **States**: no camera/event shows an empty instruction; image error shows unavailable/error text; no sample video fallback is allowed.
- **Accessibility**: image alt names selected camera and event.
- **Motion**: no media animation beyond incoming MJPEG frames.

### Clip History

- **Structure**: count header, repeated clip rows with optional reviewed label controls.
- **Variants**: populated, empty.
- **Spacing**: `p-4`, `space-y-3`.
- **States**: empty state is explicit and non-failing.
- **Accessibility**: video controls remain native where clip playback is historical evidence, not live fallback.
- **Motion**: none.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 150ms | ease-out | Tile/button color transition |
| Standard | 200ms | ease-in-out | Modal or panel state where already present |

### Rules

- Animate only color, opacity, or transform.
- Do not animate live media layout.
- Interactive elements need hover, active/selected, and focus-visible affordances.

## 7. Depth & Surface

### Strategy

Mixed tonal-shift plus restrained shadows.

| Level | Value | Usage |
| --- | --- | --- |
| Soft | `shadow-soft` | Light registry/header panels |
| Glow | `shadow-glow` | Dark sidebar and live workspace |
| Border/subtle | `border-white/10` | Live frame and dark empty states |

### Rules

- Use shadows to separate major surfaces only.
- Live video itself is framed by a subtle border and black background, not a decorative card.
- Keep rounded corners consistent with existing `rounded-2xl`, `rounded-3xl`, and `rounded-4xl`; do not introduce pill cards except controls/status chips.
