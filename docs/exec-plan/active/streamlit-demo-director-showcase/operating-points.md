# Operating Points — Director Showcase Sweep

Sweep date: 2026-06-13  
Method: real inference only (ADR-005 §5). Pose size **n** (nano) throughout.  
Temporal models: window=30, stride=5 (from each model's `metadata.json`).  
Sweep started at `start_sec = max(0, fall_start/fps − 30s)` to skip non-relevant clip head;
pre-window FP counts are measured from that start point, not from absolute frame 0.

`logistic_regression` artifact absent from disk — skipped.  
`transformer` produced no fall probability ≥ 0.05 inside the gold window for clips 3 or 4 — not usable for those clips.  
`rule_based` did not fire inside the gold window for clips 3 or 4 under any tested `sustained_down_sec` (0.5–2.0 s).

---

## Results Table

| Clip | Classifier | Threshold | Pose size | Key params | Fires in window? | Earliest fire frame | Pre-window FPs | Notes |
|------|-----------|-----------|-----------|-----------|-----------------|--------------------|--------------------|-------|
| 2021-10-27 베스트요양원1 505호 (frames 3205–3240 @24 fps) | random_forest | 0.10 | n | conf=0.05, window=30, stride=5 | **YES** | 3206 | 10 | FPs measured from frame ~2484 (103.5 s context start). Threshold 0.20 (NH default) did not fire in window for this clip. |
| 2026-05-29 4층휴게실 미상 (frames 128–152 @25.9 fps) | random_forest | 0.05 | n | conf=0.05, window=30, stride=5 | **YES** | 144 | 0 | Cleanest result — zero pre-window FPs, fires 16 frames into window. |
| 2026-04-19 베스트요양원2 405호 (frames 786–813 @37.59 fps) | svm | 0.40 | n | conf=0.05, window=30, stride=5 | **YES** | 804 | 15 | Fires near end of window (frame 804 of 786–813). Lower thresholds fire earlier but with more FPs (svm 0.30 → 19 FPs; random_forest 0.20 → 21 FPs). |
| 2026-02-25 베스트요양원1 502호 (frames 170–250 @41.34 fps) | lstm | 0.30 | n | conf=0.05, window=30, stride=5 | **YES** | 188 | 0 | Any threshold 0.10–0.50 fires at frame 188 with 0 pre-window FPs. 0.30 chosen as robust demo value. |

All 4 clips fire the red 🔴 낙상 indicator inside the labeled gold window.

---

## Recording Recipes

Each recipe lists the exact Streamlit demo control state needed to reproduce the red fall indicator during a showcase recording. All use pose size **n** (nano) for CPU speed.

---

### Clip 1 — "2021-10-27 베스트요양원1 505호"

**Target:** red 🔴 fires at frame 3206 (133.6 s), 1 frame into the gold window (3205–3240).

| Control | Setting |
|---------|---------|
| YOLO26-pose size | **n** (Nano) |
| 분류 모델 | **Random Forest** |
| 판정 임계값 slider | **0.100** (drag left from default 0.200) |
| 탐지 파라미터 → 신뢰도 임계값 | 0.05 (default — leave unchanged) |
| 탐지 파라미터 → 낙상 판단 지속시간 | — (not used by temporal model) |

Cue: advance the demo playback to ~130 s (frame ~3120), then watch — red fires at ~133.6 s.  
Note: 10 is_fall frames appear before the window (measured from 103.5 s); these are pre-fall detections that may be visible during pre-roll.

---

### Clip 2 — "2026-05-29 4층휴게실 미상"

**Target:** red 🔴 fires at frame 144 (5.56 s), 16 frames into the gold window (128–152).

| Control | Setting |
|---------|---------|
| YOLO26-pose size | **n** (Nano) |
| 분류 모델 | **Random Forest** |
| 판정 임계값 slider | **0.050** (drag left from default 0.200) |
| 탐지 파라미터 → 신뢰도 임계값 | 0.05 (default) |

Cue: play from the start — fall is near the beginning of the clip (5.56 s). Zero pre-window FPs.  
This is the cleanest clip for a showcase: no false positives before the fall.

---

### Clip 3 — "2026-04-19 베스트요양원2 405호"

**Target:** red 🔴 fires at frame 804 (21.39 s), inside the gold window (786–813).

| Control | Setting |
|---------|---------|
| YOLO26-pose size | **n** (Nano) |
| 분류 모델 | **SVM** |
| 판정 임계값 slider | **0.400** (drag right from SVM default ~0.047) |
| 탐지 파라미터 → 신뢰도 임계값 | 0.05 (default) |

Cue: play from the start; fall fires at 21.39 s (frame 804 of the 786–813 window).  
Risk: 15 pre-window FPs from frame 0 to 786 — the red indicator may briefly appear earlier in the clip. The high threshold (0.40) is the tightest setting that still fires in-window; lower thresholds have 19–265 FPs.  
Alternative (fewer FPs, fires later in window): svm 0.40 is already the best available for this clip.

---

### Clip 4 — "2026-02-25 베스트요양원1 502호"

**Target:** red 🔴 fires at frame 188 (4.55 s), inside the gold window (170–250).

| Control | Setting |
|---------|---------|
| YOLO26-pose size | **n** (Nano) |
| 분류 모델 | **LSTM** |
| 판정 임계값 slider | **0.300** (drag right from LSTM LE2I default ~0.001) |
| 탐지 파라미터 → 신뢰도 임계값 | 0.05 (default) |

Cue: play from the start; fall fires at 4.55 s (frame 188 of the 170–250 window).  
This is a very clean result: 0 pre-window FPs at any threshold from 0.10 to 0.50. 0.30 chosen to be well above noise floor. GCN at 0.30 also gives 0 FPs and fires at frame 188 — viable alternative if LSTM load is undesirable.

---

## Risk Summary

| Clip | Risk level | Details |
|------|-----------|---------|
| 2021-10-27 베스트요양원1 505호 | Medium | 10 pre-window FPs in the 30 s run-up; red may briefly flash before the actual fall event |
| 2026-05-29 4층휴게실 미상 | **Low** | 0 pre-window FPs; cleanest for a recorded demo |
| 2026-04-19 베스트요양원2 405호 | High | 15 pre-window FPs from frame 0; consider starting demo playback at ~18 s (frame ~677) to reduce visible false positives. `transformer` and `rule_based` produced no in-window detection under any swept setting. |
| 2026-02-25 베스트요양원1 502호 | **Low** | 0 pre-window FPs; robust across a wide threshold range |
