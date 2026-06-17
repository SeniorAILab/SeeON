# NH pose scale-up run notes (#24 step-1) — inconclusive, see caveats

> **Correction (#198).** An earlier version of this file labelled the numbers below
> as "pose detection rate" and concluded that scaling the pose backbone does not
> help. **Both claims were wrong.** What follows is what was actually measured and
> why it does **not** answer #24's question.

## What was actually measured
`cd ml && uv run python -m training.evaluate_nh --model-key random-forest --pose-size {n,s} --artifact-base models/fall`

`evaluate_nh`'s `detection_rate` = `caught_confirmed_falls / confirmed_gold_falls`:
the **end-to-end fall-catch rate** of the *full* pipeline — YOLO26-pose extraction
+ greedy-IoU tracking **+ the random-forest fall classifier** — against the 19
confirmed falls in `nursing-home-gold.csv`, gated by `nh_reference_mask.json`.

| pose-size | weight | sha256 (prefix) | fall-catch | value |
|---|---|---|---|---|
| n | `yolo26n-pose.pt` | `eb3bb826…` | 13/19 | 0.684 |
| s | `yolo26s-pose.pt` | `a083adb4…` | 11/19 | 0.579 |
| m | `yolo26m-pose.pt` | — | not run (pose extraction timed out) | — |

## Why this is inconclusive (do not cite as a finding)
1. **It is the fall-CATCH rate, not pose detection.** It measures whether the RF
   classifier flagged each gold fall end-to-end — not whether pose *found* the
   bedridden/occluded person. #24's metric ("25-73% vs 100% upright") is pose
   person-detection, which this does **not** measure.
2. **Sample is tiny.** 19 clips; the n-vs-s gap is 2 clips — within sampling noise.
3. **Classifier–pose coupling confound.** The RF classifier was trained/calibrated
   on a specific pose size's keypoints; swapping the pose backbone changes its
   inputs, so an n→s change can be a classifier mismatch artifact, not pose quality.

## #24 step-1 status
Open. A valid step-1 needs a **pose person-detection rate** measurement (frames
where pose finds a person present in ground truth, across n/s/m) — a different
measurement than `evaluate_nh`. The `--pose-size` harness (#190) is reusable for
that once the right detection-rate metric is wired. step-2 domain fine-tuning
stays deferred (no labeled NH training data).
