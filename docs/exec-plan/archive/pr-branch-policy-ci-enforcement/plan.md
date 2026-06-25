---
slug: pr-branch-policy-ci-enforcement
status: done
---

# PR Branch Policy CI Enforcement

## Goal

Align PR branch policy enforcement with the existing workflow decision:

- PR base branch policy is a hard CI gate.
- Protected head branches (`main` by default, matching `scripts/git-guard/lib.sh`) are a hard CI gate for same-repo PRs.
- Head branch naming (`<type>/<issue#>-<slug>`) is checked as a CI notice only, not as a hard gate.

## Scope

- Update `.github/workflows/pr-check.yml` only where needed for PR branch policy behavior.
- Keep the existing size gate behavior unchanged.
- Keep `docs/rules/worktree-workflow.md` aligned with the implemented policy.

## Verification

- `git diff --check`
- Local syntax/simulation check of the GitHub Script branch-policy block.
