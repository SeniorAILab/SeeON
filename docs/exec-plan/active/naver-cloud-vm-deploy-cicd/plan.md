---
slug: naver-cloud-vm-deploy-cicd
status: active
created: 2026-06-23
author: Codex
---

# Naver Cloud VM deploy and CI/CD plan

## Steps

1. Inspect existing Compose, Docker, and CI surfaces.
2. Verify SSH reachability and determine the Naver Cloud login path.
3. Add a bootstrap script for a fresh Ubuntu 24.04 VM.
4. Add an idempotent deploy script that updates the repo and runs the production host Compose stack.
5. Add a GitHub Actions workflow that SSHes to the VM after CI succeeds on `main`.
6. Add a runbook for one-time bootstrap, required GitHub secrets, and operational commands.
7. Verify scripts/workflow locally and record live-server blockers.

## Constraints

- The VM has only `1 GB` RAM, so deployment should pull GitHub-built images and avoid on-server application builds.
- Real `.env` values remain out of git and must come from server files or GitHub Secrets.
- The first SSH login may require the Naver Cloud console-generated admin password before key-based deploy automation can work.
