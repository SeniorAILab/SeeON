---
slug: poc-intent-prd-recovery
title: Recover deleted POC monitor intent into the PRD
author: codex
created: 2026-07-01
status: superseded-by
superseded-by: poc-intent-deferred-prd-backlog
---

# Plan

## Goal

Recover product intent from the deleted 2F POC surface into the <vault> PRD without restoring legacy product routes or POC-only UI code.

The deleted POC was not just a route experiment. It encoded four product ideas worth preserving:

- "현재 확인 필요" attention queue for staff/monitor surfaces.
- "추천 순찰 순서" for risk-prioritized patrol guidance.
- Observer-only pilot scenario and emergency-test controls.
- Pilot UX measurement: alert count, acknowledgement time, TTS played, help requests, and staff feedback questions.

## Evidence

Deleted POC source recovered from the previous commit:

- `front/src/pages/poc/PocFloor2Page.tsx` selected scenarios (`평상시`, `저녁 식사 후`, `취침 준비`, `야간 순찰`, `위험 이벤트 테스트`) and gated them to observer/admin users.
- `front/src/components/poc/CurrentAttentionPanel.tsx` showed the large "현재 확인 필요" panel with reason, detail, and acknowledgement actions.
- `front/src/components/poc/PatrolOrderPanel.tsx` encoded the "어디부터 가야 하지?" decision-support intent as recommended patrol order.
- `front/src/components/poc/FeedbackForm.tsx`, `front/src/stores/feedbackStore.ts`, and `front/src/stores/uxTestStore.ts` captured pilot UX feedback and acknowledgement timing.

## Scope

Update the <vault> Obsidian PRD outside the repo to include:

- Features In rows for current attention queue, recommended patrol order, pilot UX validation mode, and pilot UX measurement.
- Staff Dashboard and Monitor Display design requirements mentioning the queue and patrol guidance.
- User-flow requirements for queue sorting, patrol fallback, observer-only demo controls, and UX measurement.
- Routing acceptance that `/poc/*` remains non-product while recovered POC intent is absorbed into canonical staff/monitor requirements.
- OI-026 for productizing these requirements into the future API/read-model/store boundary.
- Timeline, Decision Log, and Change History entries for v0.9.

## Must Not Have

- Do not restore `/poc/2f`.
- Do not re-add `PocFloor2Page` or deleted `front/src/components/poc/*`.
- Do not expose observer/demo controls in the staff production UI.
- Do not add backend schema/API design in this PRD recovery pass.

## Verification

- Direct file read of the <vault> PRD contains:
  - `현재 확인 필요 큐`
  - `추천 순찰 순서`
  - `Pilot UX 검증 모드`
  - `Pilot UX measurement`
  - `OI-026`
  - `v0.9`
- `front/src` still has no restored `PocFloor2Page`, `front/src/components/poc/*`, or `/poc/2f` product route.
- `git diff --check` passes.
- Staged diff contains only this repo-tracked plan.

## Commit Strategy

One documentation commit:

- `docs(prd): recover POC monitor intent`
