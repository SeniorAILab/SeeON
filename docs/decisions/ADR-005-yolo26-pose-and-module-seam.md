# ADR-005: YOLO26-pose Stack and a Two-Seam Module Architecture for Stream Ingestion and Inference

## Status

Accepted. Pose domain-fit on our nursing-home CCTV was tested on 2026-06-08 and is
**partially verified**: pose is captured precisely wherever a person is *detected*, but
bedridden patients under a ceiling top-down view (often blanket-covered) are an
out-of-distribution *detection-miss*. See **Verification Results** and Decision §1.

## Date

2026-06-08

## Context

The PoC fall-detector demo (`ml/demo/`) was built around three pretrained,
publicly available bounding-box fall classifiers, surfaced through a Streamlit
UI:

1. `melihuzunoglu/human-fall-detection` (Hugging Face; classes `{fallen, sitting, standing}`; YOLO11)
2. `SyedBurhanAhmed/Real-Time-Fall-Detection-using-YOLO` (GitHub; classes `{non-fall, fall}`; LE2I-trained YOLOv11)
3. `Tomotsugu-dev/Human-Fall-Detection` (GitHub; classes `{Normal, Fall}`; YOLOv8)

Each model draws a bounding box around a person and **classifies that box
directly** as fallen / not-fallen in a single frame. The label is learned from
the appearance (RGB pattern) of the box region.

**The control experiment.** Running these models inside our Streamlit harness on
our `processed` nursing-home footage produced unreliable output: constant
"fall" collapse, simultaneous contradictory states, and false positives/negatives
even on the upstream models' *own* demo clips when re-interpreted under our UI.
The initial suspicion was that the Streamlit rewrite had broken the research
baseline (e.g., overlaying a synthetic pose, mis-thresholding, or mislabeling).

To separate "we mis-controlled the experiment" from "the model genuinely does not
transfer," each model was run on **its own upstream demo asset at its own default
confidence (0.25)** — the control the upstream authors themselves publish. Under
that faithful control the models reproduce their reported behavior on home-style
footage but **degrade on our nursing-home CCTV**. The footage differs in domain:
top-down camera angle, frequent occlusion, and multiple people in frame — none of
which the home-dataset training distribution covers.

**The diagnosis.** Appearance-based, single-frame bbox classifiers trained on
home datasets do not transfer to nursing-home CCTV. A bounding box memorizes the
camera's RGB pattern, so it is brittle to viewpoint and lighting shift, and a
single frame cannot encode that **a fall is a temporal event** — a transition
over time, not a static pose. This is a generalization limit of the method, not
a bug in our harness.

**The proposed direction.** Move to pose estimation: extract keypoints per frame,
accumulate a time window, and classify the *trajectory*. The team selected
**Ultralytics YOLO26-pose** (released Jan 2026) as the pose/detection framework,
over MediaPipe BlazePose. This ADR records that framework decision and the
module architecture that lets stored video and live stream feed the model
through one identical path, while keeping the existing bbox models as a
comparison module rather than deleting them.

This ADR **complements ADR-003** (serving/training lifecycle split); it does not
supersede it. ADR-003 defines *where* inference lives (the FastAPI serving
boundary, the ML/backend split, artifact versioning). ADR-005 defines *how* a
frame stream is ingested and *which* model framework consumes it — the internal
shape of the inference path that ADR-003 wraps in an HTTP endpoint.

## Decision

### 1. Framework: MediaPipe → Ultralytics YOLO26-pose

The pose/detection framework is **Ultralytics YOLO26-pose**. MediaPipe BlazePose
is deferred (interface-only; see §3).

The rationale is **design-level, not an empirical claim on our footage**:

- **Method generalizes better than appearance memorization.** Pose keypoints +
  a temporal window classify the *motion structure* of a fall, which is less
  coupled to a specific camera's RGB pattern than a single-frame bbox label.
  This is an argument about the *method's* inductive bias, not a measured result
  on our CCTV.
- **Trainable / fine-tunable.** Ultralytics supports first-class training and
  fine-tuning (`model = YOLO("yolo26n-pose.pt")`, one-line CLI). MediaPipe is
  inference-centric and offers little fine-tuning support; once our own labeled
  data exists, YOLO can be adapted to the nursing-home domain and MediaPipe
  largely cannot.
- **Deployment simplicity.** YOLO26 is NMS-free / end-to-end, reducing
  post-processing and stabilizing edge/CPU latency; export paths (ONNX, TensorRT,
  CoreML) are mature.
- **Multi-person native.** Nursing-home frames routinely contain several people;
  YOLO handles multi-person natively, whereas BlazePose is single-person by
  default and needs a hybrid pipeline.

**Honest scope — what is NOT claimed.** YOLO26-pose documents an RLE (Residual
Log-Likelihood Estimation) head that predicts a per-keypoint uncertainty
`(σ_x, σ_y)` at training time. **That σ is not exposed at inference through the
Ultralytics Results API**, so we do not build on it. More importantly, the claim
"YOLO26-pose captures pose well on our top-down, occluded, multi-person nursing
CCTV" was treated as a hypothesis to be **tested, not asserted**. It has since
been run (see **Verification Results** below); the honest outcome is **partial** —
pose is captured precisely wherever a person is *detected*, but bedridden patients
under a ceiling top-down view are an out-of-distribution *detection-miss*. Pose
quality is judged with GT-free proxies (person-detection rate, mean visible-keypoint
count, mean keypoint confidence, temporal jitter) as supporting signals, with
**visual inspection as the primary judge** — because we have no keypoint ground
truth on this footage and therefore cannot compute OKS.

### 2. Two-seam module architecture (stream-seam + model-seam)

The inference path is structured around **two minimal seams**, expressed as a
normalized result dataclass plus one `typing.Protocol` each — no ABC, no
registry, no plugin framework (YAGNI: only Ultralytics is wired today).

**Stream-seam — `FrameSource`.** A stored video file and a live RTSP/stream are,
for the model, the same thing: a sequence of frames. The stream-seam is an
iterator that unifies both behind one shape:

```python
# conceptual shape, not final code
class FrameSource(Protocol):
    def __iter__(self) -> Iterator[Frame]: ...
```

A file-backed source (OpenCV `VideoCapture` over a path) and a live source
(`VideoCapture` over an RTSP URL) both yield `Frame`s; downstream code never
branches on origin. This is the *persistence/영속성* property the brief asks for:
"video냐 실시간 스트림이냐"는 구별이 모델 입력 단계에서 사라진다.

**Model-seam — `ModelModule`.** A model is anything that turns one frame into a
normalized result:

```python
class ModelModule(Protocol):
    def predict(self, frame: Frame) -> DetectionResult: ...
```

`DetectionResult` is a single normalized dataclass carrying the union of what a
module can emit (boxes, labels, keypoints, scores), so the renderer and any
downstream consumer depend on the dataclass, not on a specific framework's
result object. Swapping YOLO-detection for YOLO-pose, or later for MediaPipe, is
a change of which `ModelModule` is selected — nothing downstream changes.

The model is **per-frame**. The temporal layer (windowing keypoints →
trajectory classification) is a **separate, deferred concern** that sits above
this seam; it is intentionally *not* part of `ModelModule` and is out of scope
for this ADR.

### 3. Two orthogonal axes: framework (a module) vs output (a render option)

A recurring confusion is collapsed here explicitly:

- **Framework / model = a swappable MODULE** (the model-seam). Ultralytics YOLO
  is wired now; MediaPipe is **interface-only / deferred** — it would be a second
  `ModelModule` implementation, added when justified, with no downstream change.
- **bbox / pose / label = OUTPUT OPTIONS**, i.e. render toggles on a
  `DetectionResult`, **not** modules. A single Ultralytics module can emit both
  detection (bbox + label) and pose (keypoints); whether the UI draws the box,
  the skeleton, or the text label is a view concern. "bbox" is not a model — it
  is one way to display what a model already produced.

Mixing these two axes is what produced the earlier mental-model error ("is
MediaPipe a kind of bbox?"). They are independent: any module may support any
subset of output options.

### 4. Stream ingestion is designed for future serving reuse

The stream-seam exists because **stored-video playback and live serving are the
same logic** — load frames, push to the model — and we do not want two
divergent implementations. The `FrameSource` abstraction is deliberately shaped
so the same ingestion code the demo uses today can back the serving path later.

This respects ADR-003's **training ≠ serving** split: the stream-seam is a
*serving-side* construct (online frame ingestion), not a training-data loader.
It complements ADR-003 by filling in the internal shape of the inference path
that ADR-003's `POST /predict` boundary wraps; it does not move or weaken that
boundary. ML still returns predictions only; the backend still owns alert policy.

### 5. Keep the bbox classifiers as a comparison module; delete only the fakes

The three pretrained bbox models (melihuzunoglu / tomotsugu / syed) and their
local artifacts (`ml/artifacts/pretrained/*/best.pt`) are **kept**. Once the
model-seam exists, they become legitimate `ModelModule` implementations useful as
a **comparison baseline** for the pose approach — keeping them is what makes the
bbox-vs-pose claim in §1 testable rather than asserted. The earlier plan to
aggressively purge all bbox code was reversed for exactly this reason: a clean
seam turns "throwaway" into "pluggable."

What **is** removed is only the throwaway scaffolding that fabricated data:

- the fake `DemoFallModel` and its synthetic `_pose_for_score` /
  `_score_for_behavior` pose-overlay generator in `demo/model_registry.py`
  (it draws an *arbitrary* skeleton from a score ramp — exactly the "임의 overlay"
  the brief flags as misleading),
- the `demo-fall-pose` / `demo-stable-pose` fake specs and the fake realtime
  adapter,
- the scratch `ml/debug_detect.py`.

These are deleted because they invent state that never came from a model —
which violates the project rule that we do not paint arbitrary ground-truth into
`ml/`. Real artifacts and real upstream demo assets stay.

### 6. Enshrine the in-domain control finding before deleting the code that proved it

Recorded here as the empirical basis for the whole pivot, so it survives the
cleanup in §5:

> Appearance-based, single-frame bounding-box fall classifiers trained on home
> datasets **do not transfer** to nursing-home CCTV. Run on their *own* upstream
> demo assets at their *own* default confidence (0.25), they reproduce their
> reported behavior; run on our top-down / occluded / multi-person `processed`
> footage, they collapse (constant "fall," contradictory simultaneous states,
> false positives and negatives). The cause is method-level (RGB-pattern
> memorization + single-frame blindness to a temporal event), not a harness bug.

This finding is *in-domain control evidence* (measured), distinct from the pose
direction in §1 (hypothesis). The distinction is deliberate and must be kept:
the failure of bbox transfer is observed; the success of pose transfer is not yet
observed.

## Verification Results (2026-06-08)

The "next experiment" promised in Decision §1 was run: **YOLO26-nano pose**
(`yolo26n-pose.pt`) on a representative sample of 6 of the 23 real nursing-home
clips (40 evenly-spaced frames each; GT-free proxies + visual inspection of saved
annotated frames). The remaining 17 clips were not sampled — listed explicitly in
the run log, not silently dropped. Outcome: **partial — the hypothesis holds
conditionally.**

| Clip (scene) | person-detection rate | visible kpts /17 | mean kpt conf |
|---|---|---|---|
| 3F lounge (multi-person, upright) | **100%** | 13.6 | 0.914 |
| Room 206 (ambulatory) | **100%** | 13.5 | 0.894 |
| Room 505 | 72.5% | 14.6 | 0.890 |
| Room 404 (facility-2) | 57.5% | 10.7 | 0.902 |
| Room 301 (large clip) | 51.3% | 11.1 | 0.886 |
| Room 502 (largest/newest, bedridden) | **25%** | 12.2 | 0.896 |

Three findings, stated honestly:

1. **When a person is detected, pose is captured precisely — even at nano scale.**
   Across *all six* clips, every fired frame returns 10–15 of 17 visible keypoints
   at confidence 0.886–0.914. Skeleton quality is uniformly good regardless of
   scene; nano locks the pose tightly once it finds the person.
2. **The failure mode is detection-miss, not bad skeletons.** Upright/seated people
   (lounge, ambulatory patients) → 100% detection. Bedridden patients viewed
   near-vertically from a ceiling camera, often under a blanket → 25–73% detection.
   The model simply does not *find* the person in those frames; it is not that it
   draws a poor skeleton.
3. **Root cause = out-of-distribution, not model capacity.** Ceiling top-down +
   lying + blanket is a pose essentially absent from COCO. This is a *distribution*
   problem, which bounds what scaling alone can fix (see roadmap).

**External corroboration.** Ultralytics' own guidance (team YouTube channel;
archived to NotebookLM) makes the same general argument we reached independently:
bbox appearance classifiers hit a production-level ceiling, and pose estimation is
the route to better generalization. We treat this as corroboration of the
*direction*, not as evidence about our specific footage. (Ultralytics also
demos email-alerting pipelines, suggesting this serving pattern is common in
industry — noted for the serving side, out of scope here.)

### Improvement roadmap (cheap → fundamental)

1. **Scale up first (cheap, minutes).** `yolo26{n,s,m}-pose.pt` is a one-line weight
   swap through the model-seam — re-measure how far detection rate climbs on the
   same sampled clips. Scaling raises precision/recall **within the training
   distribution** (small, partially-occluded, atypical-but-in-distribution poses),
   so it should recover *some* of nano's misses. Low energy, data-driven check.
2. **Domain fine-tuning (fundamental).** If bedridden top-down misses persist after
   scaling — expected, because **scale does not teach an out-of-distribution pose** —
   the root fix is fine-tuning on labeled nursing-home frames from the ceiling
   viewpoint showing lying / blanket-covered patients. A bigger model sharpens
   in-distribution precision; only new training data adds the missing pose to the
   distribution. This is the line we hold honestly: a larger model will not, on its
   own, learn that "a person is there" in a viewpoint it never saw.
3. **Cost / serving trade-off.** Larger weights raise inference latency and cost,
   weighed against edge / real-time serving constraints (ADR-003 serving lifecycle).
   The right size is the smallest that clears the detection bar *after* fine-tuning,
   not the largest available.

### What YOLO-stage fine-tuning buys (and what it does not)

Fine-tuning YOLO improves **pose capture** — finding the person and placing
keypoints. It does **not** decide "fall." That is a separate, **thin classifier**
over a temporal window of keypoints: pose supplies clean keypoints, the classifier
defines what a fall *is*. This is the temporal layer this ADR defers (Decision §2,
Consequences); the verification above validates only the per-frame pose-capture
stage beneath it. A further accuracy lever, noted but not scoped here, is
**multi-modal** fusion (pose + additional signals) to push fall-decision accuracy
beyond single-stream keypoints.

## Alternatives Considered

### A. Stay on bbox classifiers and tune thresholds / retrain

**Rejected.** The control experiment (§6) shows the failure is method-level, not
a threshold artifact: the models collapse on our domain even at their own
published confidence. Per-frame appearance classification cannot represent a fall
as a temporal transition, and no threshold recovers viewpoint/occlusion
generalization. Retraining a bbox classifier on nursing data might help but
inherits the single-frame ceiling and still memorizes appearance.

### B. Keep MediaPipe BlazePose instead of YOLO26-pose

**Rejected (deferred, not forbidden).** MediaPipe is an excellent inference-time
prototyping tool (mobile/web, stable single-person tracking, more keypoints).
But it offers little training/fine-tuning support and is single-person by
default — both disqualifying for a multi-person nursing domain that will need
domain adaptation on our own labeled data. It is retained as a *deferred second
module* behind the model-seam (§3) precisely so this decision is reversible
without architectural change.

### C. Aggressively purge all bbox code

**Rejected (reversed mid-design).** The first instinct was to delete the bbox
models with the fakes. But a clean model-seam makes them pluggable comparison
baselines, and a baseline is what lets us *prove* (not just assert) that pose is
better on our domain. Deleting them would throw away the control arm of the very
experiment §1 promises to run. Only the fabricated/fake adapters are purged.

### D. A full plugin framework (ABC + registry + entry points) for models

**Rejected as premature.** Only one framework (Ultralytics) is wired today. A
registry, ABCs, and dynamic discovery solve a problem we do not have. The minimal
seam — one normalized `DetectionResult` dataclass + a `typing.Protocol` per seam
— gives the same swap-ability at a fraction of the surface area. If a third or
fourth independently-authored module ever lands, promoting the Protocol to a
registry is a localized change.

### E. Separate ingestion code for files vs live streams

**Rejected.** Two code paths for "frames from a file" and "frames from RTSP"
would drift and double the serving-vs-demo maintenance. The persistence insight
(§4) is that they are the same iterator of frames; one `FrameSource` seam serves
both, which is the entire point of designing it now rather than later.

## Consequences

**Positive:**

- The bbox-vs-pose comparison becomes an experiment with a real control arm
  (kept bbox modules) rather than a slogan.
- Stored video and live stream share one ingestion path, so the demo's frame
  loop is reusable by the serving lifecycle without a rewrite (complements
  ADR-003).
- Swapping detection ↔ pose, or YOLO ↔ MediaPipe later, is a module selection,
  not a refactor. Output rendering (bbox/pose/label) is decoupled from model
  choice.
- The synthetic-pose overlay — the most misleading artifact in the old demo — is
  gone; nothing in `ml/` paints keypoints that did not come from a model.
- The honest framing (pose domain-fit = unverified) keeps the next experiment
  scientifically meaningful instead of confirmation-seeking.

**Negative / Trade-offs:**

- **The core premise is partially verified — conditional, not settled.** "Pose
  transfers to our CCTV where bbox did not" was run on 2026-06-08 (see
  **Verification Results**). The honest outcome is split: pose is captured
  precisely *wherever a person is detected*, but bedridden patients under a
  ceiling top-down view (often blanket-covered) are an out-of-distribution
  **detection-miss** (25–73% on those clips vs 100% upright). The pivot's payoff
  holds for the detected case; the *domain-fit* line item for OOD viewpoints stays
  **open** and is gated on scale-up re-measure → domain fine-tuning, not on a
  bigger model alone (scale raises in-distribution precision, it does not teach an
  unseen pose).
- No keypoint ground truth exists on our footage, so pose quality is judged
  primarily by visual inspection plus GT-free proxies — weaker than OKS against
  labels. Conclusions are qualitative until labeled data exists.
- RLE per-keypoint uncertainty, a headline YOLO26 feature, is **not usable** at
  inference through the current Ultralytics API; any uncertainty-aware logic must
  wait for API support or a custom head.
- The temporal classification layer (the part that actually decides "fall") is
  deferred and not designed here; the model-seam only delivers per-frame results.
  The hardest modeling question — how many states, how to turn a keypoint window
  into a fall decision — remains open.
- The minimal Protocol seam is enforced by convention, not by a registry or
  contract test; a future contributor could bypass `DetectionResult` and couple
  the UI to a raw Ultralytics result, eroding the seam.
