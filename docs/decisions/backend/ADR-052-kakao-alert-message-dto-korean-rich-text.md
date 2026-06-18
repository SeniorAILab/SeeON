# ADR-052: Kakao fall-alert message is built from a DTO into Korean rich text

- Status: Accepted
- Date: 2026-06-18
- Refs: #226; deep-interview spec `.gjc/specs/deep-interview-kakao-fall-alert-delivery.md`; ralplan `2026-06-18-0708-af1a`

## Context
`KakaoSendToMeChannelAdapter.buildTemplate` emitted a debug English string
(`Fall alert: fall source=… external_event_id=… detected_at=…`) that leaked database/debug
identifiers and was not caregiver-readable. The requirement is a beautiful, Korean,
caregiver-facing alert.

## Decision
Introduce `KakaoAlertMessageDto { residentName, room, detectedAtKST, confidence, dashboardLink }`
and pure builders (`toKakaoAlertMessageDto`, `buildKakaoAlertText`, `buildKakaoTemplateObject`).
The adapter maps an `AlertDeliveryMessage` to the DTO at the application/adapter seam and renders a
Kakao `object_type: text` template: Korean rich text with emoji/newlines, resident name, room,
KST timestamp (`YYYY-MM-DD HH:mm KST`), confidence percent, and a dashboard link — bounded to
≤180 characters with no debug/database IDs. Hardcoding is minimized: link URL, endpoint, and scope
are config/env-driven; message fields flow through the typed DTO.

## Decision Drivers
- Readable caregiver message; deterministic, unit-testable field mapping.
- No debug IDs in caregiver-facing text; bounded length for Kakao's text template.
- Hardcoding minimization (env/DTO/config over inline literals).

## Alternatives Considered
- Inline string assembly in the adapter — untestable, leaks IDs, violates hardcoding-minimization.
- External config-template string with placeholders — fragile length/typing, can leak fields.
- Feed/image template — out of scope (no snapshot; ml unchanged).

## Consequences
- The backend delivery context (`AlertDeliveryMessage`) must carry `resident_name`/`resident_room`
  (see ADR-053 / the resident seam) and a 0–1 `confidence` mapped to a percent in the DTO.
- Korean copy lives in a deterministic builder in code (not a DB column / not adapter-side fetch).

## Follow-ups
- Consider validated, operator-editable templates post-MVP if copy changes become frequent.
