---
slug: ncloud-smoke-retry-image-prune
author: codex
date: 2026-06-23
---

# Plan

1. Replace the single-shot deploy curl with a bounded retry loop.
2. Add a post-smoke image cleanup loop for unused images under the app GHCR
   namespace.
3. Validate shell syntax and env/compose contract checks.
4. Ship through PR, main CI, deploy, and VM smoke verification.
