---
slug: local-manual-production-deploy
status: done
---

# Local Manual Production Deploy Plan

## Steps

1. Capture failing trigger-policy proof before changing deployment files.
2. Comment out only the `release.published` workflow trigger and keep `workflow_dispatch`.
3. Update release/manual deploy CLI text to reflect local manual deploy as the current path.
4. Update runbooks, agent guidance, and ADRs so operator-facing docs agree.
5. Verify trigger behavior, pull-only invariants, stale wording cleanup, manual dry-run output, compose config rendering, and live public smoke after user-requested deployment.

## Verification

- RED/GREEN trigger check in `.omo/evidence/task-1-local-manual-production-deploy.txt`.
- Pull-only invariant check in `.omo/evidence/task-4-compose-invariants.txt`.
- Manual deploy dry-run evidence in `.omo/evidence/task-4-manual-deploy-dry-run.txt`.
- Live deploy transcript and smoke output in `.omo/evidence/live-manual-deploy.txt` and `.omo/evidence/live-smoke-root.txt`.

## Guardrails

- Do not remove the stored GitHub Actions deploy implementation.
- Do not run production deploy until local checks pass.
- Do not add dependencies.
- Do not change application runtime behavior.
