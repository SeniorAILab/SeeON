# Deep Interview Spec — PR98 structure-preserving merge

## Metadata

- Slug: `pr98-structure-preserving-merge`
- Profile: quick
- Context type: brownfield
- Rounds: 3
- Final ambiguity: 3.9%
- Threshold: 5.0%
- Context snapshot: `.omx/context/pr98-structure-preserving-merge-20260616T032538Z.md`
- Transcript: `.omx/interviews/pr98-structure-preserving-merge-20260616T032538Z.md`
- Source PR: https://github.com/GoBeromsu/eldercare-fall-ai/pull/98/changes

## Intent

Merge PR #98 only after it is integrated into the existing Streamlit demo structure without introducing duplicate UI/control patterns, brittle tests, or reusability regressions.

## Desired outcome

A merge-ready PR #98 variant where the Korean healthcare UI/theme work is retained, but the integration is structurally clean:

1. Existing demo seams remain the source of truth for model selection, pose-size selection, overlay toggles, uploads, and live playback.
2. The new AppTest coverage is maintainable, not a large brittle copy of exact labels and repeated widget lookup logic.
3. The merge does not change inference semantics, temporal model behavior, threshold semantics, live frame processing, or dependencies.

## In scope

- Review and, if needed, rewrite PR #98 changes in:
  - `ml/demo/app.py`
  - `ml/demo/app_assets.py`
  - `ml/demo/demo_ui.py`
  - `ml/demo/pages/live_camera.py` if shared UI/control changes require parity checks
  - `ml/.streamlit/config.toml`
  - `ml/tests/test_demo_app_controls.py`
  - PR-added docs under `docs/exec-plan/active/streamlit-demo-director-showcase/` only as needed for lifecycle consistency
- Refactor tests to reduce duplication and label brittleness, for example by using shared constants, helper finders, fixtures, parametrized tables, or semantic widget lookup helpers.
- Extract UI label/branding constants or helper functions only where they reduce real duplication or support test maintainability.
- Preserve Korean UI and healthcare theme intent from PR #98.
- Verify with targeted Streamlit AppTest/pytest and relevant lint/static checks available for changed files.

## Out of scope / non-goals

- No inference logic changes.
- No changes to model seam, temporal classifier behavior, decision-threshold semantics, frame ingestion, or live-loop pacing/render semantics.
- No new dependencies.
- No fabricated boxes, keypoints, labels, fall states, videos, or inference results.
- No broad product UI/dashboard redesign as part of this merge.

## Decision boundaries

OMX may decide without further confirmation:

- How to factor labels, widget lookup helpers, AppTest fixtures, and repeated assertions.
- Whether inline brand/header code should remain local or move into a shared helper, as long as the primary test-maintainability goal is served.
- Whether PR-added tests should be reorganized, renamed, split, parametrized, or narrowed if equivalent control coverage is preserved.
- Whether PR-added docs need lifecycle cleanup to avoid active-plan duplication or stale status, provided no private data is published and no ADR is created for purely implementation-level choices.

OMX must not decide without further confirmation:

- Changing inference outputs, thresholds as user-facing semantics, classifier defaults, model availability rules, or runtime dependencies.
- Dropping the Korean healthcare UI intent from PR #98.
- Removing meaningful control coverage without an equivalent maintainable replacement.

## Constraints

- Follow `docs/rules/streamlit-demo.md`:
  - preserve legitimate operator controls;
  - do not add duplicate model-seam knobs;
  - keep live playback on the single-placeholder `st.empty().image` path;
  - do not write mp4 or use `st.video()` in the live path;
  - keep bounding box and pose skeleton toggles independent;
  - keep public mode fail-safe and session-scoped upload filtering;
  - keep package-qualified imports and avoid dual-import shims.
- Follow ADR-003: Streamlit is an ML demo, not product frontend; backend owns product alerts.
- Follow ADR-005: model seam vs render option distinction remains intact; no fake inference artifacts.
- Follow ADR-010/011: live per-frame observation and live-camera page sharing remain intact.
- Preserve existing worktree/user changes not related to this task.

## Testable acceptance criteria

- PR #98 can be merged with no new dependencies and no inference-path changes.
- `ml/tests/test_demo_app_controls.py` is maintainable:
  - repeated widget lookup logic is centralized or clearly helper-driven;
  - exact Korean labels are not scattered as magic strings across many tests when a shared constant/helper would suffice;
  - control coverage remains equivalent for upload, domain/role selection, video selection, classifier selection, threshold slider, detection params, YOLO size, overlay toggles, play/stop state.
- Existing Streamlit demo rules still hold:
  - public mode does not expose internal nursing-home videos;
  - overlay toggles remain independent;
  - live-loop rendering behavior remains unchanged;
  - model/classifier selection still goes through existing seams.
- If shared label/branding constants are introduced, application code and tests consume the same source where practical.
- `ml/demo/pages/live_camera.py` still renders with shared controls after any `demo_ui.py` changes.
- Verification includes at minimum the relevant `uv run pytest` target for demo controls from `ml/`, plus lint/type/static checks that are already standard for this repo when applicable.

## Assumptions exposed and resolved

- Assumption: “strict redesign” means broad UI redesign. Resolved: it means structural cleanup before merge, especially test maintainability.
- Assumption: shared UI helper extraction is the primary gate. Resolved: it is optional/desirable; test maintainability is primary.
- Assumption: PR docs can be blindly merged. Resolved: not a primary interview decision; review them for lifecycle consistency during planning/execution.

## Brownfield evidence vs inference notes

- Evidence: PR #98 is mergeable and touches Streamlit demo UI, theme config, AppTest controls, and demo showcase docs.
- Evidence: `demo_ui.py` is already the shared location for live controls and model/classifier selection.
- Evidence: `pages/live_camera.py` imports shared controls from `demo_ui.py`, so `demo_ui.py` changes must be checked against both pages.
- Inference: inline header branding in `app.py` is a potential reuse smell, not automatically a violation.
- Inference: the AppTest suite’s repeated exact Korean strings are a likely maintainability smell; the user confirmed this is the strict-redesign priority.

## Optional durable documentation recommendations

- If execution discovers a stable convention for Streamlit UI label constants or AppTest helper style, consider adding a short rule to `docs/rules/streamlit-demo.md`. This is optional and should be public-safe.
- No ADR is recommended unless execution makes a cross-cutting, expensive-to-reverse decision beyond this PR’s test/UI structure.

## Recommended handoff

Recommended next step: `$ralplan` or `$ultragoal` using this spec.

- Use `$ralplan` if you want an explicit pre-merge cleanup plan before touching PR #98.
- Use `$ultragoal` if you want durable goal tracking through cleanup, verification, and merge-readiness.
- Use `$team` only if parallel review/implementation lanes are warranted.
- Use `$ralph` only as an explicit fallback for single-owner persistence.
