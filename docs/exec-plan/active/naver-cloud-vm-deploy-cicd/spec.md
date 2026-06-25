---
slug: naver-cloud-vm-deploy-cicd
status: active
created: 2026-06-23
author: Codex
---

# Naver Cloud VM deploy and CI/CD

## Goal

Deploy the existing single-host eldercare stack to the Naver Cloud Ubuntu VM and prepare GitHub Actions so future `main` updates can deploy to that VM.

## Inputs

- VM: `eldercare-fall-ai`
- Public IP: `<retired-host>`
- Private IP: `10.0.1.6`
- OS image: `ubuntu-24.04-base`
- Size: `mi1-g3` (`1 vCPU`, `1 GB RAM`)
- SSH login key file: `/Users/<user>/Downloads/seniorsailab.pem`

## Requirements

- Use the repo's existing Docker Compose production host stack where possible.
- Keep backend and database internal; expose only the public `front` nginx service on port `80`.
- Add repo-side automation that can be driven locally and from GitHub Actions.
- Do not commit real secrets.
- Document the one-time Naver Cloud access step because the PEM is used to retrieve the initial admin password, not direct SSH key login for this VM.

## Acceptance

- Local deployment scripts pass shell syntax checks.
- Compose config still renders for the production deployment.
- GitHub Actions workflow is syntactically parseable.
- Server reachability/access state is recorded, including any blocker.
