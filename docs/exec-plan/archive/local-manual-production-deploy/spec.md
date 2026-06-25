---
slug: local-manual-production-deploy
status: done
---

# Local Manual Production Deploy

## Outcome

Pause automatic GitHub Actions production deployment from published releases while keeping the existing local SHA-pinned image build/push deployment as the current operator path.

## Scope

- Disable only the automatic release-triggered deploy entrypoint.
- Keep explicit `workflow_dispatch` available.
- Preserve the existing GitHub Actions deploy job body for later re-enable.
- Keep production deploys SHA-pinned and VM pull-only.
- Update operator-facing release/deploy wording and ADR authority so the current path is unambiguous.

## Must Not Have

- No deletion of existing deploy job steps.
- No `latest`, fallback tag, fallback branch, or VM-side application image build.
- No application runtime, Dockerfile, compose topology, migration, or seed behavior changes.
- No production deploy during local verification; live deployment is a separate user-requested step after local checks pass.
