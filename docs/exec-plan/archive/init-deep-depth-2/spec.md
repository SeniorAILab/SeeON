---
slug: init-deep-depth-2
title: "Initialize depth-2 AGENTS hierarchy"
type: spec
date: 2026-06-24
---

# Spec

Run `omo:init-deep` in update mode after pulling from `origin/main`, limited to depth 2.

## Requirements

- Preserve existing AGENTS/CLAUDE guidance.
- Read current repository structure and existing AGENTS files before writing.
- Use depth-2 scoring to add only warranted local guidance anchors.
- Keep generated content project-specific and non-duplicative.
- Verify formatting, line counts, git status, and resulting hierarchy.
