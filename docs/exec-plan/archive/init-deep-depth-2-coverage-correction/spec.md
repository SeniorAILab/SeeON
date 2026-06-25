---
slug: init-deep-depth-2-coverage-correction
title: "Correct depth-2 AGENTS coverage"
type: spec
date: 2026-06-24
---

# Spec

Correct the depth-2 `omo:init-deep` pass by explicitly validating backend,
frontend, and ML coverage.

## Requirements

- Add missing depth-2 AGENTS files for high-scoring source/test subtrees.
- Preserve existing ML allowlist behavior and avoid AGENTS files for storage or
  generated-output roots.
- Update parent AGENTS files only for local routing.
- Verify hierarchy, line counts, and markdown diff hygiene.
