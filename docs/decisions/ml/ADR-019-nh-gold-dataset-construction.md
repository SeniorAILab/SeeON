# ADR-019: Nursing-Home Gold Dataset Construction Methodology

## Status

Accepted

## Date

2026-06-12

## Context

The autoresearch loop (#74) needs a real-world evaluation axis: LE2I is a
side-view public corpus, while deployment is top-down nursing-home CCTV.
ADR-009 established the gold-clip idea (the locked gold-8 baseline) and
ADR-017 consumes a confirmed NH corpus for its zero-tolerance gate — but no
ADR records **how that corpus is constructed**: what a label is, who may
assert it, how errors are corrected, and what the dataset may be used for.

This matters because the first gold attempt failed in exactly these gaps:
labels were proposed against **raw** footage stems while evaluation ran on
**processed** (cropped/trimmed) clips, producing frame ranges that pointed at
the wrong moments. The redo (commits 0978349, dd5cfb8) and a post-confirm
human correction (a937797: the 0408 503호 fall is at frames 1500–1800, not
105–135 — the first range was a recovered near-fall) shaped the rules below.

MECE boundary: ADR-018 owns cross-machine custody and how label files move;
ADR-017 owns the adoption gates that consume the corpus; ADR-013 owns LE2I
window labelling semantics; ADR-012 owns where footage lives and who can see
it. This ADR owns only the construction methodology of the NH gold corpus.

## Decision

**1. The labelling substrate is the processed clip, at its native fps.**
Every row in `ml/data/eval/nursing-home-gold.csv` references a processed-clip
stem (`video`) and a frame interval (`fall_start_frame`, `fall_end_frame`)
in that clip's own frame space, with the clip's measured `fps` recorded in
the row. Raw footage is never the labelling reference: processed clips are
what models consume, and the raw↔processed correspondence is recorded
separately in `ml/data/eval/raw-processed-mapping.csv` (stem, frame offset,
pixel-level match evidence) so provenance survives without contaminating the
label space. These two CSVs are the only git-tracked files under `ml/data/`.

**2. Labels carry an explicit authority status: `proposed` vs `confirmed`.**
An agent may add or update rows only with `status: proposed`, derived from
model/pose evidence and contact-strip frame review. Only a human, reviewing
the actual footage on the operator machine, may set `status: confirmed`
(custody side of this gate: ADR-018 §5). Evaluation and gate freezing read
**confirmed rows only** — a proposed row is invisible to every metric.

**3. Corrections are append-style git commits, never silent edits.**
A label error found after confirmation is fixed by a new commit that states
what changed and why (a937797 is the reference example). Git history is the
label audit trail; the CSV itself stays minimal. Doubts are recorded in
`notes` on the row (e.g. the 2026-01-09 202호 fall-vs-intentional-sit doubt)
so downstream analyses can condition on label confidence.

**4. The corpus has two deliberate strata: falls and no-fall footage.**
Confirmed fall rows (currently 19) measure catch capability; confirmed
no-fall videos measure the false-positive side on deployment-equivalent
windows (multi-person tracks and tracker noise included, 9,158 windows in
phase-3). Hard negatives — near-falls and recoveries adjacent to real falls,
like the 0408 503호 f105–180 recovery — are kept and annotated, because they
are exactly what threshold policy must discriminate.

**5. NH gold is evaluation-only.** No NH-derived sample ever enters a
training set or HP search objective. Training and model selection run on
LE2I (ADR-013); NH gold exists to measure transfer and to arm the ADR-017
regression gate. This keeps the only real-world corpus uncontaminated as a
held-out axis — the property that exposed the LE2I↔NH ranking inversion.

## Alternatives Considered

### Label against raw footage (first attempt)

- Pros: raw is the canonical source (ADR-012); no mapping table needed
- Cons: models consume processed clips; raw frame indices silently misalign
  after cropping/trimming — this happened, and invalidated the first corpus
- Rejected on evidence: the gold redo cost a full relabel cycle. The
  mapping table preserves raw provenance without the misalignment risk.

### Agent-confirmable labels (no human gate)

- Pros: no human bottleneck during unattended runs
- Cons: the corpus's entire value is that it is ground truth; a model-assisted
  labeller confirming its own evidence is circular, and ADR-017's gate would
  inherit that circularity
- Rejected: the propose/confirm split costs hours, not days, and the 503호
  correction shows human review catches errors agents structurally cannot
  (the model's plausible window was a different, real-looking event).

### Event-time labels (seconds) instead of frame intervals

- Pros: fps-independent, human-friendly
- Cons: NH clips have heterogeneous, sometimes non-integer fps (24.0, 57.85);
  second-based labels would need per-clip fps conversion at every consumer,
  recreating the misalignment class of bugs in a new place
- Rejected: frames in the clip's own space + recorded fps is unambiguous.

### Fold NH clips into the training pool

- Pros: scarce real-world data could improve the models fastest
- Cons: destroys the only held-out real-world axis; with 19 falls the
  training value is marginal while the evaluation value is decisive
- Rejected: evaluation-only status is what made the sequence-model transfer
  finding (and the linear-model collapse) observable at all.

## Consequences

**Positive:**

- Label provenance is fully reconstructable: footage (read-only) +
  mapping CSV + git history of the gold CSV.
- The propose/confirm split lets unattended agents prepare labelling work at
  full speed without ever being able to corrupt ground truth.
- Hard negatives and recorded doubts make threshold-policy analysis honest —
  the 202호 row's doubt is visible in every downstream report.

**Negative / Trade-offs:**

- Human confirmation is a hard serialization point: unattended loops must
  defer NH evaluation until a human is available (this happened in #74 —
  the NH gate ran as a batch re-eval after confirmation).
- 19 confirmed falls give ±11 pp binomial error; the corpus ranks nothing on
  its own (ADR-017 already constrains it to a regression gate). Growing the
  corpus is the standing follow-up (ADR-017 §Follow-ups 2).
- Two CSVs and a status column are more ceremony than a flat label file —
  accepted as the price of an auditable ground truth.
