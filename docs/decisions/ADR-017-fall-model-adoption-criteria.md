# ADR-017: Fall-Model Adoption Criteria — Evaluator Contract, NH Zero-Tolerance Gate, and Hard Disqualifiers

## Status

Accepted.

## Date

2026-06-10

## Context

The autoresearch loop (plan `fall-autoresearch-loop`, issue #74) runs experiments unattended for up to eight hours and must emit an adoption decision for each candidate model without human involvement. For that to be trustworthy three structural problems must be addressed upfront.

**First**, the domain risk profile is asymmetric: a missed fall in a nursing-home setting is the expensive error (a resident lies undetected), whereas a false alarm causes at most a staff interruption. Any ranking metric that does not make this safety constraint explicit — such as optimal F1 or PR-AUC — will, under Bayesian optimisation pressure, trade recall for precision whenever doing so improves the aggregate score. The adoption criterion must encode the recall floor as a hard constraint, not a soft preference.

**Second**, the nursing-home (NH) gold corpus contains only thirteen confirmed clips. The binomial standard error at that sample size is roughly ±11.6 percentage points, which means NH accuracy alone cannot rank two models whose true performance is close. Using NH as the primary evaluator would make the leaderboard statistically meaningless after a small number of experiments.

**Third**, the autoresearch loop is designed to keep the evaluation contract frozen across all runs so that leaderboard entries remain comparable. If the operating threshold or the gating corpus were allowed to shift between experiments, a model that "wins" in experiment ten might have won against a different baseline than experiment two, making the journal uninterpretable. The contracts below are therefore set before the first unattended run and may not change without an explicit human-initiated re-baseline that is recorded in a separate commit.

MECE boundary: ADR-009 owns the fall-classification strategy and the gold-8 locked baseline; ADR-013 owns the window geometry, label semantics, threshold policy, and the `metadata.json` train↔serve contract. This ADR owns only the adoption decision rule applied by the harness after each experiment is evaluated.

## Decision

### 1. Primary gate — LE2I window-level Precision @ Fall-Recall ≥ 0.90

The single ranking metric for the leaderboard is **window-level precision at the operating point where fall-recall ≥ 0.90 on the held-out LE2I split** (`precision@recall≥0.90`, hereafter P@R90). This is a continuous scalar produced directly by `evaluate.py`'s existing `recall_90` operating-point logic — no new evaluation code is required, and the contract is the same for every model family.

A higher P@R90 score means the model achieves the mandatory recall floor while generating fewer false alarms. Precision is the tiebreaker, not the primary objective: a model with recall exactly at 0.90 and precision 0.40 outranks a model with recall 0.91 and precision 0.39 only if precision is compared at the same recall operating point. The harness reads `precision_at_recall_90` from the run JSON as the leaderboard entry.

### 2. Hard disqualifier A — recall floor not achieved

If `evaluate.py`'s optimal-F1 fallback is triggered (i.e., the model cannot reach 0.90 recall anywhere on its precision-recall curve), the harness **forces the leaderboard score to 0.0** and sets `recall_90_achieved: false` in `runs/{id}.json`. The model is ineligible for adoption regardless of its optimal-F1 value.

The reason this must be a disqualifier rather than a penalty is that the fallback silently moves the operating point — a model reported at "precision 0.65" under fallback and "precision 0.65" under the recall_90 rule are not comparable because they are evaluated at different thresholds. Mixing the two in a single leaderboard would invalidate the ranking.

### 3. Hard disqualifier B — inference latency budget exceeded

The target deployment is a 30 fps camera stream processed with stride 5, which allocates **(5 / 30) × 1000 ms = 167 ms** per inference call. A model with a median single-window inference latency above this threshold cannot run in real time on the deployment hardware. The harness measures latency as: batch size 1, ten warmup calls discarded, **median of one hundred calls on m1-pro CPU**. If `inference_latency_ms > 167`, the harness sets `latency_gate_failed: true` and forces the leaderboard score to 0.0. This disqualifier is independent of the recall gate — a model may fail both simultaneously.

The 167 ms threshold is derived from the stride-5 / 30 fps geometry (ADR-013 §2) and is therefore frozen by the same window-geometry contract. Changing the threshold requires a superseding ADR or a superseding change to the window geometry decision.

### 4. Secondary gate — NH gold zero-tolerance miss regression

After a model clears both hard disqualifiers it is checked against the **frozen nursing-home reference mask** (`ml/experiments/nh_reference_mask.json`). The mask records, for each model family, the set of gold fall IDs (the `video` stem from `nursing-home-gold.csv`) that the five-family baseline successfully detected. If the candidate model misses **any fall that the frozen mask records as caught**, it is rejected regardless of its LE2I score. The gate result is recorded as `nh_gate_passed: bool` in the run JSON.

The mask is frozen once — immediately after all five baseline families (RF, SVM, LSTM, Transformer, GCN) have been evaluated on NH gold, before the first unattended loop run begins. The mask is never updated mid-loop. Re-freezing is only permitted on explicit human approval, documented in a separate commit. This prevents the gate baseline from drifting toward whichever model family is currently winning, which would reduce the gate to a tautology.

The NH gate is a **regression check, not a ranking criterion**: it cannot elevate a model's score, only veto it. This design is deliberate given the thirteen-clip corpus — the gate has enough statistical power to detect a clear regression (a fall that was reliably caught is now missed) but not enough to rank two models that both pass.

## Alternatives Considered

### Optimal-F1 as the single ranking metric

The F1-optimal threshold is already computed by `evaluate.py` and would require no new code. It was rejected because it makes the recall floor implicit rather than structural: under F1 optimisation, a model that achieves 0.88 recall with high precision scores nearly as well as one at 0.90 recall with slightly lower precision, so the leaderboard will favour precision-oriented models whenever the optimal-F1 point falls below 0.90. The 0.90 floor exists because the domain risk profile demands it; a metric that does not encode the floor as a hard constraint cannot be trusted to preserve it under optimisation pressure.

### PR-AUC (area under the precision-recall curve)

PR-AUC captures model quality across all operating points and is a reasonable summary statistic when the deployment threshold is unknown. It was rejected here because the deployment threshold is known — ADR-013 fixes it at the recall_90 operating point — so integrating over all thresholds introduces noise without adding information. More critically, PR-AUC does not define which threshold is used at serving time, so a "winning" PR-AUC score does not translate to a deployable artifact without a second threshold-selection step that reintroduces ambiguity.

### Event-level metrics (e.g., per-fall detection rate)

Event-level evaluation — counting whether the model correctly signals at least one positive window within the annotated fall interval — better matches the clinical use case than window-level accuracy. It was not adopted for this loop because no event-level evaluation code exists in the current codebase. Introducing it would require writing and validating new evaluation infrastructure mid-loop, creating a risk of silent bugs that corrupt the leaderboard. It is tracked as a follow-up.

### NH gold clips as the primary (or sole) evaluator

The NH clips are top-down CCTV footage that more closely resembles the deployment environment than the side-view LE2I dataset. Making NH the primary evaluator would be conceptually cleaner. It was rejected because thirteen clips produce a binomial standard error of roughly ±11.6 percentage points, making it impossible to reliably distinguish two models whose true performance differs by fewer than twenty percentage points. Using a statistically weak corpus as the primary ranking criterion would make the leaderboard dominated by random variation rather than genuine model quality.

## Consequences

**Positive:**

- The adoption decision is fully automated: every candidate model produces a deterministic pass/fail outcome from `recall_90_achieved`, `latency_gate_failed`, and `nh_gate_passed`, with no subjective threshold judgment required during the unattended run.
- The recall floor is enforced structurally rather than by convention, eliminating the failure mode where optimisation pressure silently trades safety margin for leaderboard score.
- The frozen NH mask ensures the gate baseline cannot drift across experiments, keeping all leaderboard entries comparable for the lifetime of the loop.
- The latency gate prevents deploying a model that passes accuracy checks but cannot run in real time on the target hardware, avoiding a class of silent deployment failures.

**Negative / Trade-offs:**

- Models with recall between 0.88 and 0.90 are disqualified regardless of precision. Some architectures may be genuinely competitive at a slightly lower recall threshold; this ADR trades that flexibility for an unambiguous safety contract.
- The NH gate's trustworthiness is entirely dependent on the quality and completeness of the human-confirmed gold labels. A mislabelled clip can either veto a good model (false gate failure) or fail to catch a genuine regression (false gate pass). This risk cannot be mitigated architecturally; it requires discipline in the labelling process — every label in `nursing-home-gold.csv` must have `status=confirmed` from a human reviewer before the mask is frozen.
- The reference mask is frozen to the five-family baseline performance. If a new model family is introduced after the loop begins, its NH performance at baseline is not in the mask, so it will be compared to the catch record of the original five families. This is intentional — the gate is a regression check — but it means a new family's first experiment always passes the NH gate by construction. An explicit re-baseline commit is required to bring new families into the gate.
- Locking the operating point at recall_90 means the leaderboard does not capture model improvements at other recall thresholds. If a future workstream targets a different deployment configuration (e.g., a less safety-critical alarm system), the adoption criteria will need a superseding ADR rather than a simple parameter change.

## Follow-ups

These items are out of scope for this loop but should be addressed in subsequent work:

1. **Event-level evaluation** — Migrate the primary evaluation metric from window-level to event-level (per-fall detection rate, temporal overlap). This is the natural next step once the window-level loop has produced a stable champion model and the evaluation infrastructure investment can be justified. Tracked as separate work.

2. **Expand NH clip count beyond 13** — The thirteen-clip corpus limits the gate to a binary regression check and cannot support statistical ranking. Expanding the confirmed clip count to at least fifty would reduce the binomial SE to below ±7 percentage points and make the NH gate a meaningful secondary ranker. At that scale a Streamlit gold-reviewer tool becomes cost-justified; at the current thirteen-clip scale the two-image contact-strip workflow is sufficient.

3. **Retention policy for `ml/experiments/runs/`** — Each unattended session accumulates one JSON and one Markdown file per experiment. After several multi-session loops the directory will contain hundreds of files. A retention policy (e.g., archive runs older than N sessions, or compress all but the ten most recent non-baseline runs) should be defined before the directory becomes unwieldy. This is a housekeeping decision, not an architectural one, and does not require an ADR.
