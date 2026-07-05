# Frontend UX audit note (elder 50-60+)

Scope: brief Wave2 finding note only. No product-code changes in this document.

## Finding types to clean up

| Finding type | Examples to search/replace | Why it matters for 50-60+ eldercare operators | Cleanup owner |
| --- | --- | --- | --- |
| Raw neutral/black colors | `text-gray-*`, `bg-gray-*`, `border-gray-*`, `bg-black/*`, `text-black/*` | Bypasses DESIGN.md semantic tokens and can break contrast/dark staff surfaces. | PR2 shell already handled shared navigation; remaining page/component occurrences map to PR3-PR8 by owned surface. |
| Arbitrary tiny typography | `text-[11px]`, one-off captions, body copy below 14px | Dense admin metadata may be acceptable only as micro captions; operational body text should stay 16px-oriented where possible. | PR3 spaces/floors, PR4 residents, PR5 alerts/events, PR6 dashboards, PR7 admin cleanup, PR8 final UX sweep. |
| Arbitrary dimensions/spacing | `h-[18px]`, bespoke chip heights, non-token spacing | Fixed operational elements should be stable and follow the Tailwind 4px scale unless the value is a documented design token. | PR3-PR7 in owned pages; PR8 consolidates leftovers. |
| Touch targets below elder/staff standard | Small icon buttons, cramped tabs/actions under `h-10`, staff primary actions below 52px | Staff workflows are used under motion, distance, gloves, and urgency; targets need at least 48px generally and 52-56px for staff primaries. | PR2 shell for nav; PR3-PR7 page-local controls; PR8 cross-page pass. |
| Body text below 14px | Table/list/card descriptions rendered as `text-xs` or arbitrary 11-12px outside badges/metadata | Reading speed and error rate worsen for older operators; DESIGN.md allows sub-14px only for captions/badges. | PR3-PR7 per owned CRUD/monitor surface; PR8 verifies exceptions. |
| Color-only status communication | Dots, tinted chips, borders, or row backgrounds without explicit label/icon text | WCAG and elder UX require redundant state cues; status must be text and/or icon plus color. | PR5 alerts/events first; PR3/PR4 resource state chips; PR6 dashboards; PR8 sweep. |
| Motion outside safe properties | Layout-affecting animation or decorative pulse/scale | Motion should not destabilize operational layout; respect reduced-motion users. | PR2 shell for navigation motion; PR5/PR6 live-risk surfaces; PR8 final sweep. |
| Demo/mock/runtime wording | `mock`, `demo`, `sample`, `시연`, fake-data labels | Wave2 uses real DB/runtime only; UI copy must not imply synthetic operation. | PR1 retired mock runtime; PR3-PR7 remove page-local copy; PR8 final copy audit. |

## PR mapping summary

| PR | Expected cleanup focus |
| --- | --- |
| PR1 | Retire runtime mock/demo paths and remove mock-facing UI assumptions. |
| PR2 | Shared navigation shell, role routing, facility scope, and API header policy. Also owns persistent navigation and shell-level target sizing. |
| PR3 | Spaces/floors CRUD pages: token colors, readable form/table text, touch-safe controls, non-color-only space/floor states. |
| PR4 | Residents/care pages: elder-readable body text, safe action sizing, status labels with text/icon cues. |
| PR5 | Alerts/events: highest priority for WCAG AA, status redundancy, caution/danger semantics, and safe live-motion patterns. |
| PR6 | Dashboard/monitor surfaces: large operational type, stable cards, semantic statuses, reduced decorative motion. |
| PR7 | Admin cleanup/users/facilities: remove legacy admin mock language, raw neutrals, tiny table metadata where not justified. |
| PR8 | Final UX sweep across remaining frontend-owned surfaces after PR3-PR7 land; verify DESIGN.md deviations are either fixed or intentionally tokenized. |

## Research/design basis

- Prefer 16px+ body text for routine reading. DESIGN.md sets Body at 16px and allows 14px only for admin labels/nav/descriptions; below 14px is reserved for captions, badges, or micro metadata.
- Touch targets should be at least 48px for general elder-friendly controls. Staff primary actions should be 52-56px per DESIGN.md because caregivers may use them at distance, in motion, or with gloves.
- Maintain WCAG AA contrast and use semantic token pairs (`text-ink`, `text-ink-soft`, `status-danger`, `status-dangerBg`, etc.) instead of raw gray/black values.
- Status cannot rely on color alone. Pair semantic color with visible text and, where useful, an icon/dot so risk and state remain clear for color-vision and low-vision users.
- Keep navigation persistent and predictable. Shell-level nav should remain visible/sticky enough for fast role/task switching without forcing memory recall.
- Restrict motion to `transform`, `opacity`, color, and shadow; avoid layout animation. Honor `prefers-reduced-motion`, and reserve pulse/scale effects for active risk or direct interaction feedback.
