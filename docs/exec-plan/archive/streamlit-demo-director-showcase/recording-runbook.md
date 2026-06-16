# Recording Runbook — Director Showcase (4 clips)

Goal: for operator-only archival replay, produce four screen recordings (`~/Downloads/<clip>_fall.mp4`) of the
Streamlit demo where the real 🔴 낙상 status + 🚨 낙상 감지 badge fire on
genuine nursing-home footage. For hospital directors (원장님) verifying that
falls are actually detected and shown in red.

**Why this is a runbook and not a one-click script:** the recording is an
*external screen capture of the live UI* — `rules/streamlit-demo.md §2` forbids
the demo from writing mp4 itself, and `ADR-005 §5` forbids fabricating any
detection. So the red must come from a real play-through that you watch and
capture. The classifier/threshold per clip (from `operating-points.md`) is
already solved; you just drive the UI and run `record.sh`.

---

## One-time setup

1. **Screen Recording permission.** System Settings → Privacy & Security →
   Screen Recording → enable your terminal app (Terminal / iTerm). Restart the
   terminal afterward. Verify the screen device index:
   ```bash
   ffmpeg -f avfoundation -list_devices true -i ""   # expect "[3] Capture screen 0"
   ```
   If the index is not `3`, pass it via `SCREEN_DEVICE=<n> ./record.sh …`.

2. **Operator-mode data reachable.** Nursing-home clips are only visible in
   `FALL_DEMO_MODE=operator` (ADR-012). They live under
   `ml/data/nursing-home/processed/`. Confirm the four clips exist:
   ```bash
   ls "ml/data/nursing-home/processed/2021-10-27 베스트요양원1 505호.mp4" \
      "ml/data/nursing-home/processed/2026-05-29 4층휴게실 미상.mp4" \
      "ml/data/nursing-home/processed/2026-04-19 베스트요양원2 405호.mp4" \
      "ml/data/nursing-home/processed/2026-02-25 베스트요양원1 502호.mp4"
   ```

---

## Launch the demo (operator mode)

In terminal **A** (leave it running):

```bash
cd ml && FALL_DEMO_MODE=operator uv run streamlit run demo/app.py
```

Open the printed URL (http://localhost:8501). You will see the
`eldercare-fall-ai` header and Korean UI.

In the sidebar / control area, for **every** clip first set:
- **도메인** → `nursing-home`
- **종류** → `processed`
- **YOLO26-pose 크기** → `nano · fastest` (size n — required by all recipes)

Then per clip, set 분류 모델 + 판정 임계값 as the table below specifies,
select the clip in the **영상** dropdown, and record.

---

## The four recordings

For each clip:
1. Set the controls per the row below.
2. Select the clip in **영상**.
3. In terminal **B**, start capture: `./record.sh <slug> <max-sec>`
   (run it from this archived folder: `docs/exec-plan/archive/streamlit-demo-director-showcase/`, or simply from this folder after checkout).
4. Switch to the browser, press **▶︎ 재생**.
5. Watch for the red **🔴 낙상** status and the **🚨 낙상 감지** badge.
6. Once it fires (let it hold a few seconds), switch to terminal B and press **`q`** to stop.
7. Output lands at `~/Downloads/<slug>_fall.mp4`.

| # | Clip (영상) | 분류 모델 | 판정 임계값 | Fires at | Pre-roll FP risk | record.sh command |
|---|-------------|----------|-------------|----------|------------------|-------------------|
| 1 | 2021-10-27 베스트요양원1 505호 | Random Forest | **0.10** | ~133.6 s (frame 3206) | ~10 brief flashes before the fall | `./record.sh 505ho 150` |
| 2 | 2026-05-29 4층휴게실 미상 | Random Forest | **0.05** | ~5.6 s (frame 144) | none (cleanest) | `./record.sh 4f-rest 30` |
| 3 | 2026-04-19 베스트요양원2 405호 | SVM | **0.40** | ~21.4 s (frame 804) | 15 flashes from clip start — start playback ~18 s in if possible | `./record.sh 405ho 40` |
| 4 | 2026-02-25 베스트요양원1 502호 | LSTM | **0.30** | ~4.6 s (frame 188) | none | `./record.sh 502ho 20` |

Recommended showcase order: **2 → 4 → 1 → 3** (cleanest first; the two
zero-FP clips lead, the FP-prone 505호/405호 last). Clip 2 (4층휴게실) is the
best single opener — fall near the start, zero false positives.

Exact control semantics (slider direction, defaults, alternatives) are in
`operating-points.md`. The 판정 임계값 slider only appears for temporal models
(Random Forest / SVM / LSTM all qualify); drag to the value in the table.

---

## Honesty notes (read before showing directors)

- **Clip 1 (505호)** and **Clip 3 (405호)** show pre-fall red flashes — these
  are *real* model false positives, not fabrications. If the directors ask, say
  so plainly; do not edit them out in a way that implies the model is cleaner
  than it is. Clip 3 is the weakest (15 FPs); leading with clips 2 and 4
  demonstrates the capability honestly without resting the pitch on the noisy one.
- Every red indicator in every recording is genuine per-frame inference
  (ADR-005 §5). Nothing is staged.
- These recordings contain real patient footage. Operator mode is local only;
  never deploy the demo publicly or share raw clips outside the authorized
  director review (ADR-012).
