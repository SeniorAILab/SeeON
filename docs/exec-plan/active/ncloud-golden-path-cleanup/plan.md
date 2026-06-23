---
slug: ncloud-golden-path-cleanup
author: codex
date: 2026-06-23
---

# Plan

1. Inventory deployment workflow, compose registry config, deploy scripts, and
   runbooks for stale permissions, retired image references, and workaround
   flags.
2. Remove or narrow those traces while preserving the successful image-pull
   deploy path.
3. Validate shell syntax, env/compose contract checks, and workflow YAML shape.
4. Review the final diff for accidental behavior expansion.
