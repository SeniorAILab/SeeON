# ADR-020: Autoresearch Loop Method — Unattended Experimentation Protocol

## Status

Accepted

## Date

2026-06-12

## Context

Issue #74 ran ~38 experiments (exp-003..040) unattended on m1-pro across six
model families, moving the leaderboard from a 0.132 baseline to 0.4483 P@R90
and producing the NH decision surface. ADR-017 defines *what* counts as an
adoptable model (gates, disqualifiers); nothing records *how* the loop itself
must run so that its results are trustworthy and reproducible. The method
emerged operationally during #74 and is captured here before it drifts.

MECE boundary: ADR-017 owns adoption criteria and gate values; ADR-019 owns
the NH gold corpus the gates consume; ADR-018 owns cross-machine custody of
the artifacts the loop produces; ADR-013 owns the training-pipeline contracts
(window geometry, threshold persistence). This ADR owns only the
experimentation protocol: HP plumbing, wave structure, record-keeping, and
the boundary between agent autonomy and human decisions.

## Decision

**1. Experiments are config-addressed harness runs on a deterministic
pipeline.** Every experiment is `python -m experiments.harness --config
<json>` with a fixed seed (42) end-to-end. Determinism is not aspirational —
it is verified: a best-config retrain must reproduce its original score
exactly (10+ exact reproductions in #74). Each run emits a journaled JSON
(config, metrics, environment) and a leaderboard row; config snapshots are
committed so any row can be re-derived.

**2. HP variation flows through one channel: `HARNESS_HP_<NAME>` env vars
with typed getters and explicit precedence.** `training/hp.py` resolves
explicit kwarg > env > fixed default; no env set means zero drift from the
committed defaults. Torch models persist their constructed architecture to an
`arch.json` sidecar so HP-varied artifacts reload correctly in env-free
processes (evaluate, latency gate, demo). Forbidden alternative: editing
model-source defaults per experiment — it destroys the journal's meaning.

**3. Search proceeds in waves: explore → exploit → boundary-probe →
best-restore.** Explore spends a fixed Optuna trial budget per family;
exploit pins discovered winners and varies one axis; boundary probes test
deliberately outside the search space (this is how logreg C=1000 — beyond
the then-cap of 100 — was found); best-restore retrains the winner and must
reproduce its score exactly before the canonical artifact is accepted. A
family is retired only on a pre-stated bar (lstm retired at 0.0977), never
on taste.

**4. Canonical artifacts are protected by snapshot-before-eval.** The
harness overwrites `ml/models/fall/<key>/` on every run, so any evaluation
of "current best" models works from a snapshot copy, and a restore wave
re-establishes the canonical best-state artifacts after each phase. The
artifact store must always end a phase holding every family's best.

**5. Claims require statistical grounding before they drive decisions.**
A leaderboard difference becomes a "finding" only after bootstrap CIs (10k
resamples in #74) say it is outside noise — this is how the logreg-vs-svm
"lead" was demoted to a tie while the C-inversion was confirmed as real.
Negative results and refuted hypotheses (e.g. scale-contamination, exp-037/38)
are journaled with the same prominence as wins.

**6. The agent decides experiments; humans decide policy.** Everything that
changes what the loop *measures* — gold confirmation (ADR-019), reference-mask
freezing and re-baselines (ADR-017), operating-point selection on the
catch-vs-FP frontier — is queued in `ml/experiments/HUMAN_QUEUE.md` with the
decision framed, options priced, and a recommendation, then blocks until a
human answers. The loop never trades safety policy for leaderboard score by
construction, because policy is not in its action space.

## Alternatives Considered

### Ad-hoc interactive experimentation (no harness contract)

- Pros: zero ceremony, fastest first experiment
- Cons: results are irreproducible the moment the operator forgets a flag;
  cross-experiment comparison silently breaks
- Rejected: the loop's output is the *journal*, not any single model; an
  unjournaled win is indistinguishable from a bug.

### Single long Optuna study per family (no waves)

- Pros: one mechanism, theoretically optimal budget allocation
- Cons: cannot act on cross-family insights mid-flight, never looks outside
  its own search space, and gives no natural point to verify reproducibility
- Rejected on evidence: the two highest-impact findings of #74 (logreg
  C beyond the cap; gcn's NH transfer) both came from outside-the-study
  moves — a boundary probe and a held-out-axis evaluation respectively.

### Fully autonomous adoption (no human queue)

- Pros: true 24h unattended operation
- Cons: operating-point choice is a miss-cost vs alarm-fatigue judgment —
  clinical/operational, not statistical; automating it launders a values
  decision through a metric
- Rejected: ADR-017 already requires human re-baselines; this ADR extends
  the same split to every policy-shaped decision.

### Mutable leaderboard (rewrite rows as understanding improves)

- Pros: leaderboard always reflects current best interpretation
- Cons: destroys the audit trail; a corrected number with no visible history
  is indistinguishable from a fabricated one
- Rejected: corrections are appended and annotated (same principle as
  ADR-019 §3 label corrections).

## Consequences

**Positive:**

- Any leaderboard claim can be re-derived from a committed config + seed,
  and the best artifacts are bit-faithful to their journaled scores.
- The env-var HP channel plus arch.json made six families HP-searchable with
  zero per-experiment source edits — adding a family is one catalog entry
  (`training/models/catalog.py`) plus one search space.
- The human queue turns unattended runs into a clean division of labor:
  the agent arrives with priced options, the human spends minutes, not hours.

**Negative / Trade-offs:**

- Human gates serialize the loop at exactly the moments of highest leverage
  (gold confirm, mask freeze) — #74 absorbed this by reordering work, but a
  fully hands-off overnight run will sometimes idle at a gate.
- Snapshot-before-eval doubles transient disk for model artifacts and adds a
  restore step that, if skipped, leaves the store holding a probe artifact —
  the restore wave is mandatory, not hygiene.
- Exact-reproduction as an acceptance bar binds the loop to single-machine
  determinism (m1-pro CPU/MPS); cross-machine reproduction is custody-bound
  (ADR-018) and explicitly not promised.
