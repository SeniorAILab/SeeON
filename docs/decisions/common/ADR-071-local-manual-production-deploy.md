# ADR-071 - Local manual production deploy while Actions-backed CD is paused

- Status: Accepted
- Date: 2026-06-25
- Partially supersedes: ADR-068 - Release-gated production deploy
- Refines: ADR-041, ADR-062, ADR-063, ADR-068

## Context

ADR-068 moved production deploy away from every `main` merge and made release
publication the production gate. That still leaves GitHub-hosted runners doing
the expensive backend/front image builds for every production release.

This repository is still operating under cost pressure. The existing manual
deploy script already resolves an explicit ref to a commit SHA, builds and
pushes backend/front GHCR images locally, uploads the deploy bundle, and invokes
the Naver Cloud VM pull-only deploy script. The production Compose overlay
already requires explicit backend/front image pins and disables app-service
builds on the VM.

## Decision

1. Local manual deploy is the current production deploy path:
   `pnpm deploy:prod:manual -- <release-or-sha>`.
2. The GitHub Actions `release.published` trigger in the Deploy Naver Cloud
   workflow is commented out, not deleted, so Actions-backed CD can be restored
   later with a small explicit change.
3. `workflow_dispatch` remains available for an explicit operator-run
   GitHub-hosted deploy with a concrete `ref`.
4. Release creation remains useful as a durable promotion marker, but publishing
   a release does not deploy production while this ADR is active.
5. `latest`, fallback tags, fallback branches, automatic retries, alternate
   hidden deploy paths, and VM-side backend/front image builds remain forbidden.

## Consequences

- Production image build cost moves from GitHub-hosted runners to the operator's
  local machine.
- The VM remains pull-only and consumes exact SHA-tagged GHCR images.
- Operators must run the manual deploy command after creating a production
  release tag.
- Re-enabling Actions-backed CD requires uncommenting the workflow release
  trigger and updating this ADR/runbook relationship.

## Alternatives Considered

- **Delete the GitHub Actions deploy workflow.** Rejected: it makes later CD
  restoration larger and riskier.
- **Build application images on the VM.** Rejected: it violates the pull-only
  production topology and makes deploys depend on server-side source/build
  state.
- **Use mutable `latest` tags to simplify deploy commands.** Rejected: it breaks
  the exact-SHA deploy contract and makes rollback/debugging ambiguous.
