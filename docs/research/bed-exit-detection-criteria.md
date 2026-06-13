# Research: Vision-based bed-exit detection criteria (eldercare)

> **Type:** research (fact collection — what I found, pre-decision). Does NOT decide.
> **Topic scope:** how to decide "person left the bed" from a monocular camera + fixed bed ROI + COCO-17 pose.
> **Generated:** 2026-06-14 · deep-research harness (97 agents, 15 sources, 53 claims → 25 verified → 8 confirmed / 17 killed).
> **Feeds:** issue #100 (bed-exit detection), deep-interview spec, future ADR on exit-trigger criterion.

## Question

Most reliable per-frame criterion to decide a person has left the bed, given a monocular camera,
a fixed bed region (bbox/ROI), and per-person 2D pose (COCO-17 keypoints + person bbox). Compare
candidate triggers: (1) person-bbox centroid leaving bed ROI + dwell, (2) ankle/foot keypoints
(COCO 15,16) crossing the ROI, (3) person-box vs bed-box IoU/containment below threshold.

## Confirmed findings (survived 3-vote adversarial verification)

1. **Skeleton/pose input beats raw-pixel / pure-geometric criteria** (high).
   Published systems extract 2D spatial features via human localization + skeleton pose estimation;
   edge-deployable (OpenPose-light on Jetson Xavier-NX) → real-time viable.
   Sources: arXiv 2106.07565; BedEye IEEE 10949079.
   *Implication for us:* our COCO-17 pose path is the right representation — no new sensor needed.

2. **1-second minimum debounce (dwell) is a peer-reviewed default** (high).
   Lin et al., Sensors 2022 (PMC9332029): fixed queue of 15 consecutive status readings at 15 fps
   ⇒ "minimum response time to recognize a behavior = 1 second". Only confirmed concrete dwell value.
   *Implication:* adopt ~1 s sustained-state debounce; reuse the existing `sustained_down_sec` pattern.

3. **Post-exit vs pre-exit is a first-order design decision** (high).
   - Post-exit: alert fires *after* the patient has left the bed (most commercial alarms; simple
     3-state on-bed/off-bed/return classifiers — PMC9332029).
   - Pre-exit / prediction: alert fires at the "end position" — sitting at the bed edge, still on
     the bed — the initial posture of the landing movement (Inoue et al., EMBC 2019, PMID 31946570).
     Clinically preferred early-warning for fall *prevention*.
   - "Many commercial alarms trigger only after a patient has already left the bed" (arXiv 2506.22498, 2-1 vote).
   Sources: PMC9332029; PMID 31946570; arXiv 2506.22498.

4. **Single-frame pose criteria cause systematic false alarms; temporal modeling + relative coords fixes it** (high).
   Sitting postures unrelated to exit (eating, responding to visitors) trip single-frame triggers.
   IEEE 9175619 (EMBC 2020): LSTM over time-series with *relative* (not absolute) position info →
   decouples from camera placement/zoom. Sources: IEEE 9175619.

5. **None of the 3 candidate geometric triggers confirmed as the primary criterion; centroid actively refuted** (medium).
   Centroid-displacement claim refuted (1-2). No confirmed claim validates ankle-only or IoU-only as
   a standalone primary trigger. Surviving evidence favors skeleton-level posture classification +
   temporal queuing over any single spatial threshold. Sources: PMC9332029; BedEye IEEE 10949079.

## Caveats (do not overclaim)

1. **No head-to-head ablation** of centroid vs ankle vs IoU in the surviving evidence. The anti-centroid
   stance is inferred from a refutation, not a controlled comparison.
2. **1 s debounce is from a single system** (15 fps, 4 camera angles). Generalization to other frame
   rates/positions untested here.
3. **Commercial "fires after exit"** holds as "many", not "most/all" (2-1 dissent: some have early-alert configs).
4. **Camera-angle (overhead vs oblique) and blanket-occlusion robustness: no confirmed claims** — empirically unresolved.
5. **Multi-person (caregiver in frame): unaddressed** by any confirmed claim.
6. Sources skew IEEE/PMC 2019–2022; commercial threshold tuning underrepresented.

## Open questions (carry into spec/ADR)

- Which spatial trigger minimizes false alarms under blanket occlusion + oblique angle (needs our own ablation)?
- Dwell-time at non-15 fps rates (IP cams often 25–30 fps) — does 1 s still hold?
- Multi-person handling: person-ID tracking vs ROI masking vs suppress-when->1-skeleton?
- Two-stage alert (pre-exit edge warning → confirmed exit) feasible with COCO-17 + mono camera? Sens/spec tradeoffs?

## Primary sources

- PMC9332029 — Lin et al., Sensors 2022 (3-state classifier, 1 s / 15-frame queue)
- PMID 31946570 — Inoue et al., IEEE EMBC 2019 ("end position" pre-exit prediction)
- IEEE 9175619 — EMBC 2020 (LSTM temporal, relative coords, sitting false-alarm motivation)
- IEEE 10949079 — BedEye (monocular RGB + OpenPose-light on Jetson Xavier-NX)
- arXiv 2106.07565 — in-bed fall-risk via localization + skeleton pose
- arXiv 2506.22498 — IJCAI 2025 workshop (commercial alarms fire post-exit)
