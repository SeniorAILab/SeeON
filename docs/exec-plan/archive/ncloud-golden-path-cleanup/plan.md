---
slug: ncloud-golden-path-cleanup
author: codex
date: 2026-06-23
status: done
---

# Plan

1. Inventory deployment workflow, compose registry config, deploy scripts, and
   runbooks for stale permissions, retired image references, and workaround
   flags.
2. Remove or narrow those traces while preserving the successful image-pull
   deploy path.
3. Move DB deployment out of the backend runtime image: keep Prisma CLI as a
   dev/build dependency, remove the compose migrate service, and replay
   migration SQL with `psql` in the deploy step.
4. Validate shell syntax, env/compose contract checks, workflow YAML shape, and
   migration SQL replay.
5. Review the final diff for accidental behavior expansion.
