---
slug: pr98-structure-preserving-merge
title: PR98 structure-preserving merge
status: done
author: codex
created: 2026-06-16
source-plan: .omx/plans/ralplan-pr98-structure-preserving-merge.md
---

# PR98 structure-preserving merge

## Direction

Strictly redesign PR #98 before merge so the Korean healthcare UI/theme is integrated through the existing Streamlit demo seams without duplicating label strings or weakening reuse.

## Constraints

- No inference logic changes.
- No new dependencies.
- Preserve existing model seams, temporal classifier behavior, frame ingestion, live-loop pacing/render semantics, and threshold semantics.
- Keep `render_live_controls(start_label, stop_label)` parameterized so the live-camera page keeps its own start/stop wording.
- Centralize only stable shared control labels; keep page-specific/action copy and one-off prose local or test-local.
- Preserve existing control coverage: upload, domain/role, video, classifier, threshold, detection parameters, YOLO size, overlay combinations, and play/stop state.
- Resolve PR-added active docs lifecycle explicitly; do not land stale `pending approval` active docs silently.

## Implementation plan

1. Prepare and inspect the PR #98 worktree and diff; avoid unrelated main-worktree and `ml/data` noise.
2. Add a side-effect-free `ml/demo/ui_labels.py` for stable shared Streamlit control labels only.
3. Update `app.py`, `app_assets.py`, and `demo_ui.py` to consume those constants through existing seams.
4. Add AppTest helper functions under `ml/tests/helpers/` and refactor `test_demo_app_controls.py` to use helpers/constants while preserving coverage.
5. Archive/status-fix PR-added showcase docs or otherwise make their lifecycle explicit.
6. Verify with targeted AppTest, ruff/static checks, inference/dependency diff checks, manual Streamlit surface observation, cleanup review, and independent code review.

## Verification

- `cd ml && FALL_DEMO_MODE=operator uv run pytest tests/test_demo_app_controls.py`
- `cd ml && uv run ruff check demo/app.py demo/app_assets.py demo/demo_ui.py demo/ui_labels.py tests/test_demo_app_controls.py tests/helpers/demo_controls.py`
- Diff audit: no dependency files and no inference-path files changed beyond UI seams.
- Manual Streamlit observation for public-mode safety and live-camera parity or explicit gap recording.
