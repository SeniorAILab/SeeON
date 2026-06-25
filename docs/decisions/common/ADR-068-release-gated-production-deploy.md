# ADR-068 - Release-gated production deploy

- Status: Accepted
- Date: 2026-06-23
- Refines: ADR-041, ADR-062, ADR-063
- Refined by: ADR-072 - Local manual production deploy while Actions-backed CD is paused

## Context

Update 2026-06-25: ADR-072 makes local manual deploy the current production path and pauses the release-triggered default
below. The workflow body and explicit `workflow_dispatch` path are retained, but
ordinary production deploys use local SHA-pinned image build/push while
Actions-backed CD is paused for cost control.

The Naver Cloud deploy workflow originally ran after the `CI` workflow succeeded
on `main`. That kept deploys small, but it also meant every merge could spend
private-repository GitHub Actions minutes on production image builds and SSH
deployment.

This repository is a private GitHub Free repository. GitHub-hosted runner usage
for private repositories consumes the account's included quota, and GitHub Free
currently includes 2,000 minutes per month plus limited Actions/Packages
storage. Production deployment also resets and replays the database schema in
the current early-product flow, so running it on every merge is too coarse.

GitHub Actions supports `release` activity triggers, including `published`, and
manual `workflow_dispatch` triggers. GitHub environments and protection rules
are limited for private repositories on Free plans, so this project uses release
publication as the explicit production gate instead of relying on environment
approval rules.

## Decision

1. Production deploy runs on a non-prerelease GitHub Release `published` event.
2. `workflow_dispatch` remains available for explicit operator deploys and
   requires a `ref` input.
3. A merge to `main` runs CI only. It does not deploy production.
4. Normal release deploy images are built by GitHub Actions and pushed to GHCR
   using the resolved commit SHA as the deploy image tag.
5. If GitHub Actions minutes are exhausted, an operator may run the explicit
   local manual deploy command for the same release/ref. That path builds and
   pushes the same SHA-tagged GHCR images from a local checkout, then invokes
   the existing VM pull-only deploy script.
6. `latest`, fallback tags, automatic retries, and VM-side image builds stay
   forbidden.

## Alternatives Considered

- **Deploy after every successful main CI run** - rejected for this phase:
  private Actions minutes are limited, and production deploy currently has real
  operational side effects.
- **Deploy on release branch pushes** - rejected: branch pushes are still easy to
  trigger accidentally and do not produce a durable release artifact.
- **Use GitHub environment required reviewers** - deferred: private repository
  environment protections are not available on GitHub Free.

## Consequences

- Release creation becomes the explicit production promotion action.
- Main can receive reviewed, CI-green changes without immediately mutating the
  Naver Cloud VM.
- Production deploy history aligns with GitHub Releases and exact commit SHA
  image tags.
- Pre-releases do not deploy production; they can be used later for staging if a
  separate environment exists.
- The quota-exhaustion path is an explicit operator action, not an automatic
  fallback from a failed workflow.
- Local manual deploys spend local compute instead of private GitHub Actions
  minutes, while preserving the same registry and VM topology.

## References

- GitHub Actions release events:
  `https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release`
- GitHub Actions manual workflow dispatch:
  `https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow`
- GitHub Actions billing:
  `https://docs.github.com/en/billing/concepts/product-billing/github-actions`
- GitHub environments:
  `https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments`
