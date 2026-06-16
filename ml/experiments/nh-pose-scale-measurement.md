# NH pose scale-up detection-rate measurement (#24 step-1)

Measured with the `--pose-size` harness from PR #190. ML returns predictions only.

## Method
- `cd ml && uv run python -m training.evaluate_nh --model-key random-forest --pose-size {n,s,m} --artifact-base models/fall`
- Detection rate = `caught_confirmed_falls / confirmed_gold_falls` over `ml/data/eval/nursing-home-gold.csv` (19 confirmed nursing-home falls), via full YOLO26-pose extraction + greedy-IoU multi-person tracking + the random-forest fall classifier (`ml/models/fall/random-forest/`).
- Per-pose-size pose cache: `ml/data/nursing-home/poses/<size>/` (no cross-size reuse).

## Results
| pose-size | weight | sha256 (prefix) | detection rate | value | status |
|---|---|---|---|---|---|
| n (nano)   | `yolo26n-pose.pt` | `eb3bb826…` | 13/19 | **0.684** | verified |
| s (small)  | `yolo26s-pose.pt` | `a083adb4…` | 11/19 | **0.579** | verified |
| m (medium) | `yolo26m-pose.pt` | — | — | — | not completed this run (pose extraction timed out; harness-resumable via `--pose-size m`) |

## Finding
Scaling the pose backbone **n → s did not improve** nursing-home fall detection — it **dropped** (68.4% → 57.9%). This corroborates the #24 hypothesis that *scale-up alone will not teach an unseen (top-down / occluded / lying) pose*: the out-of-distribution gap needs **domain fine-tuning (step-2)**, which stays deferred because labeled NH training data is absent. `m` is left as a resumable follow-up and is not expected to overturn the directional result.

## Reproduce
```
cd ml && uv run python -m training.evaluate_nh --model-key random-forest --pose-size n --artifact-base models/fall
# repeat for --pose-size s and --pose-size m
```
