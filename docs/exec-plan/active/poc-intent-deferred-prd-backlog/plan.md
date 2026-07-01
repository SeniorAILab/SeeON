---
slug: poc-intent-deferred-prd-backlog
title: Keep deleted POC monitor ideas as deferred PRD requirements
author: codex
created: 2026-07-01
status: active
---

# Plan

## Goal

Record the deleted 2F POC ideas in the Ataraxia PRD as deferred future requirements only. They should remain visible for later product design, but they must not imply current MVP implementation work.

## Deferred Requirements

- Current attention queue: sort danger/caution spaces by severity and show room, zone/bed, reason, detail, and `대응 완료`.
- Recommended patrol order: prioritize active-risk spaces and fall back to ordinary patrol when stable.
- Observer-only scenario/emergency testing: keep normal, post-meal, bedtime, night patrol, and risk-demo controls behind pilot/dev gating.
- UX measurement/feedback: capture acknowledgement time, TTS played, help requests, and staff feedback questions in a later pilot loop.

## Scope

- Update the Obsidian PRD outside the repo so these items are marked `Deferred / Future`, not `Should` or near-term `Planned`.
- Keep these ideas out of the current product route contract.
- Preserve `/poc/*` as non-product and dev/pilot-gated only.
- Keep repo evidence in this tracked execution plan.

## Must Not Have

- Do not restore `/poc/2f`.
- Do not restore deleted POC UI components.
- Do not add product code or tests for these deferred ideas now.
- Do not make staff/monitor current UI acceptance depend on these deferred items.

## Verification

- Direct PRD file read shows:
  - `현재 확인 필요 큐 | Deferred / Future`
  - `추천 순찰 순서 | Deferred / Future`
  - `Pilot UX 검증 모드 | Deferred / Future`
  - `Pilot UX measurement | Deferred / Future`
  - `OI-026 ... Deferred`
  - `추후 보류 요구사항`
- `front/src` has no `PocFloor2Page`, `front/src/components/poc/*`, or `/poc/2f` restoration.
- `git diff --check` passes.

## Commit Strategy

One documentation commit:

- `docs(prd): defer POC monitor ideas`
