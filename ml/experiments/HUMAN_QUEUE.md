# Human checkpoint queue — fall-autoresearch-loop (#74)

Unattended mode active (handoff 2026-06-10). Items below REQUIRE human action;
the loop records them here and continues with other work instead of blocking.

| # | Checkpoint | State | What the human must do |
|---|-----------|-------|------------------------|
| 1 | NH gold label confirmation (plan Step 9) | waiting — strips not yet generated (NH rsync in progress) | Review contact strips in `ml/data/eval/gold-review/{slug}/`, edit `ml/data/eval/nursing-home-gold.csv` rows to `status=confirmed` (fix frames as needed) |
| 2 | NH reference mask freeze approval (plan Step 13b) | waiting — needs 5-family baseline + confirmed gold | Approve freezing `ml/experiments/nh_reference_mask.json` (separate commit). Until then the NH gate cannot arm and no model adoption is final |

## Decision log (autonomous decisions taken within plan/spec constraints)

- 2026-06-10: ADR number 015→016→**017** — `ADR-015-ml-models-single-root.md` then
  `ADR-016-enforcement-timing-principle.md` landed on main via successive rebases;
  plan Step 17 mandated re-checking the number (`ls docs/decisions/`). Final:
  `ADR-017-fall-model-adoption-criteria.md`.
- 2026-06-10: LE2I-dependent steps unblocked early — user confirmed `le2i/poses` npz
  + Annotation_files txt fully arrived; only NH-dependent steps (evaluate_nh run,
  gold strips) wait on `ml/data/.RSYNC_DONE`. `le2i/raw` videos are NOT awaited
  (explicitly excluded by user — not needed by the loop).
- 2026-06-10: Phase 4 agent killed by process exit mid-run; partial REGISTRY refactor
  (train/evaluate/__init__) verified by pytest before completion agent resumed on top.
