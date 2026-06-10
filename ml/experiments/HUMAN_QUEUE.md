# Human checkpoint queue — fall-autoresearch-loop (#74)

Unattended mode active (handoff 2026-06-10). Items below REQUIRE human action;
the loop records them here and continues with other work instead of blocking.

| # | Checkpoint | State | What the human must do |
|---|-----------|-------|------------------------|
| 1 | NH gold label confirmation (plan Step 9) | waiting — strips not yet generated (NH rsync in progress) | Review contact strips in `ml/data/eval/gold-review/{slug}/`, edit `ml/data/eval/nursing-home-gold.csv` rows to `status=confirmed` (fix frames as needed) |
| 2 | NH reference mask freeze approval (plan Step 13b) | waiting — needs 5-family baseline + confirmed gold | Approve freezing `ml/experiments/nh_reference_mask.json` (separate commit). Until then the NH gate cannot arm and no model adoption is final |
| 3 | **LE2I annotation txts missing on m1-pro** | **BLOCKING LE2I training** — `ml/data/le2i/raw/{Home,Coffee_room}/Annotation_files/` exist but are EMPTY (0 txt files); poses npz carry no labels → loader treats all 130 clips as ADL (fall=0) | From the local mac, push the tiny label files: `rsync -a -e 'ssh -o RemoteCommand=none' --include='*/' --include='*.txt' --exclude='*' ml/data/le2i/raw/ m1-pro:~/Documents/01_Project/eldercare-fall-ai/ml/data/le2i/raw/` (KBs only). Reverse pull impossible — port 22 to the mac times out |

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
- 2026-06-10: worktree had a REAL ml/models dir (git wt only links ml/data) — failed
  smoke runs left a half-written random-forest folder there, tripping
  test_models_layout. Canonical store untouched (verified by mtime/size). Fixed by
  applying the m1-pro-lab skill procedure: worktree ml/models + ml/artifacts are now
  symlinks to the main clone.
- 2026-06-10: zero-positive-window fail-fast guard added to train.py (smoke mode
  previously skipped the fall-fraction gate → obscure IndexError on single-class
  predict_proba).
