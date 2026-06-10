# Experiment Run: {{id}}

**Date:** {{date}}
**Model Family:** {{model_family}}
**Status:** {{status}}

---

## Hypothesis

{{hypothesis}}

---

## Configuration

| Parameter | Value |
|-----------|-------|
| `n_trials` | {{n_trials}} |
| `trial_timeout_s` | {{trial_timeout_s}} |
| `hp_override` | {{hp_override}} |

---

## Results

| Metric | Value |
|--------|-------|
| `score` (P@R90) | {{score}} |
| `recall_90_achieved` | {{recall_90_achieved}} |
| `inference_latency_ms` | {{inference_latency_ms}} |
| `latency_gate_failed` | {{latency_gate_failed}} |
| `params_count` | {{params_count}} |

### Eval Metrics (recall_90 operating point)

| | Value |
|-|-------|
| Precision | {{eval_metrics.precision}} |
| Recall | {{eval_metrics.recall}} |
| F1 | {{eval_metrics.f1}} |
| AUC-PR | {{eval_metrics.auc_pr}} |
| Threshold | {{eval_metrics.threshold}} |

### NH Gate

| | Value |
|-|-------|
| `gate_passed` | {{nh_gate.gate_passed}} |
| `missed_fall_ids` | {{nh_gate.missed_fall_ids}} |

### Optuna HP Search

| Parameter | Best Value |
|-----------|-----------|
{{optuna.best_params}}

Trial scores: {{optuna.trial_scores}}

---

## Artifact

- **Weights path:** `{{weights_path}}`
- **Eval split hash:** `{{eval_split_hash}}`
- **Train seconds:** {{train_seconds}}

---

## Failure Analysis

> **Mandatory section — complete even when the experiment succeeds.**
> Address each gate failure and provide a hypothesis for the next iteration.

### Gate outcomes

- [ ] recall_90_achieved — {{recall_90_achieved}}
- [ ] latency_gate_passed — {{latency_gate_passed}} ({{inference_latency_ms}} ms vs 167 ms budget)
- [ ] nh_gate_passed — {{nh_gate.gate_passed}}

### Root cause

<!-- Describe why each failed gate failed.  If all gates passed, write "All gates passed." -->

### Next hypothesis

<!-- Based on the above, what should the next experiment change? -->

---

## Timestamps

- **Started at:** {{timestamps.started_at}}
- **Finished at:** {{timestamps.finished_at}}
