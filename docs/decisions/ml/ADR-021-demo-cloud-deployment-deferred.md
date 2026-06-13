# ADR-021: Demo cloud deployment deferred — CPU-only hosting rejected, GPU required

## Status

Accepted.

## Date

2026-06-12

## Context

ADR-010 establishes real-time per-frame live inference as the demo's standard
observation mode, and ADR-011 adds a live-camera page on top of the same seam.
A publicly hosted demo was attempted on two free CPU-only cloud tracks:

1. **HF Space** `Berom0227/eldercare-fall-demo` (Docker SDK, free 16 GB /
   2-vCPU tier) — live app <https://berom0227-eldercare-fall-demo.hf.space/>,
   Space repo <https://huggingface.co/spaces/Berom0227/eldercare-fall-demo>,
   weights <https://huggingface.co/Berom0227/eldercare-fall-models> —
   built, deployed, and **verified end-to-end** on
   2026-06-12: upload → YOLO pose → classifier → frame overlays, a full
   240-frame LE2I clip processed with no crash. Getting there required
   diagnosing a glibc heap-corruption crash class (torch's first native
   inference racing watchdog/telemetry threads) and shipping a hardened
   Dockerfile (tcmalloc `LD_PRELOAD`, `YOLO_OFFLINE`, `ATEN_CPU_CAPABILITY=avx2`,
   file-watcher off, single-thread BLAS).
2. **Streamlit Community Cloud** (plan `streamlit-community-cloud-deploy`,
   issue #90) — the boot-time weight bootstrap was merged (PR #91), but the
   dashboard activation step was never performed.

Verification surfaced that the deployment is functionally correct but
**unusable for its purpose on CPU-only hosting**:

- Playback runs ~7.5× slower than realtime (10 s clip ≈ 3.5 min) — this
  defeats ADR-010's purpose of *observing real-time* model behaviour.
- Page loading stalls and Streamlit websocket sessions reset after playback
  on the free tier.
- The live-camera page (ADR-011) cannot work at all: a cloud server has no
  camera device, and ADR-011 already rejected browser-webcam intake
  (streamlit-webrtc).

The blocker is **hardware (no GPU), not code**.

## Decision

CPU-only cloud hosting is **rejected as a demo deployment target**. The demo
remains local-first (operator machine, per ADR-012's access model); a hosted
demo is **deferred until GPU hardware** (paid GPU Space tier or another GPU
host) is justified.

The demo code and all deploy artifacts are **kept, not deleted**: the
deployment was verified correct and becomes viable unchanged on GPU hardware.
The runbook, hardened Dockerfile, pinned requirements, and boot smoke probe
are preserved in the `hf-space-deploy` skill
(`.claude/skills/hf-space-deploy/`, mirrored per the skill-mirror convention).
Plan `streamlit-community-cloud-deploy` is discarded and archived.

## Alternatives Considered

### Keep the free CPU Space as the official demo

- Pros: zero cost, already running, real inference works.
- Cons: ~7.5× slower than realtime contradicts the demo's reason to exist
  (ADR-010); live camera impossible; loading stalls.
- Rejected: a demo that misrepresents the system's responsiveness is worse
  than no hosted demo.

### Optimize the pipeline until CPU is fast enough

- Pros: would keep free hosting.
- Cons: the pose backbone is already the nano variant; the gap is structural
  (2 shared vCPUs vs realtime video inference), not an implementation slack.
- Rejected for this cycle: effort would distort the PoC toward hosting
  constraints instead of model quality.

### Delete the deploy code and Space artifacts

- Pros: less surface to maintain.
- Cons: throws away a verified-working deployment and the hard-won
  crash-class diagnosis; the only thing wrong with it is the hardware tier.
- Rejected: custody moved to the `hf-space-deploy` skill instead.

### Pay for a GPU Space now

- Pros: would likely make the demo usable as-is.
- Cons: recurring cost for a PoC-stage project with no external audience yet.
- Deferred, not rejected: this ADR is the trigger point to revisit when a
  hosted demo is actually needed.

## Consequences

- Demo sessions run locally on operator machines; no public URL is
  maintained as a supported surface. The existing Space may stay up but is
  not relied upon.
- The `hf-space-deploy` skill is the canonical custody for the deploy
  runbook + hardened Dockerfile; `ml/demo/requirements.txt` on main remains
  unpinned and unhardened — any future cloud deploy must re-apply the
  hardening recorded there.
- Plan `streamlit-community-cloud-deploy` → `status: discarded`, archived.
  The merged bootstrap (`demo/model_bootstrap.py`, PR #91) stays: it is
  harmless locally (no-op when weights exist) and useful for any future host.
- Revisiting requires only a hardware decision, not a redesign — a new ADR
  (or a status change here) when GPU hosting is funded.
