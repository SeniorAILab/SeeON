---
slug: release-prod-command
date: 2026-06-23
author: codex
---

# Spec: Release production command

## Goal

Add a repository command that creates the non-prerelease GitHub Release used to
trigger the production Naver Cloud deploy workflow.

## Requirements

- Operators can run one root-level command to create a production release.
- The command requires an explicit production tag.
- The default target is `main`.
- The command does not deploy directly, retry, or add a fallback path.
- Documentation points operators to the command instead of hand-written release
  commands.

## Non-goals

- No automatic release version calculation.
- No automatic rollback or retry behavior.
- No production deploy on ordinary `main` merges.
