---
slug: rtsp-script-surface-cleanup
status: done
---

# RTSP Script Surface Cleanup

## Goal

Keep one reusable video-to-RTSP publisher script and make worker smoke naming match
the `ml-worker` runtime. Remove the old `ml-edge-four` script surface from active
docs and tests.

## Scope

- Rename the worker RTSP smoke script from `ml-edge-four-rtsp-smoke.sh` to
  `ml-worker-rtsp-smoke.sh`.
- Generalize the smoke script to the camera list in YAML instead of enforcing
  exactly four cameras.
- Add a lightweight contract test so old mock/four script names do not return.
- Update active runbook references. Do not rewrite archived plans.

## Verification

- `uv run --directory ml pytest tests/test_edge_topology_contract.py -q`
- `bash -n scripts/rtsp-loop-video.sh scripts/ml-worker-nursing-home-backend-e2e.sh scripts/ml-worker-rtsp-smoke.sh`
- `uv run --directory ml ruff check .`
