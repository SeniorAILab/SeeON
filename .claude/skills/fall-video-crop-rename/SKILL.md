---
name: fall-video-crop-rename
description: Batch-crop eldercare fall-CCTV recordings in ml/data/{domain}/raw to the footage region and rename them by the on-screen capture date + location (시설명/호실), writing lossless copies to ml/data/{domain}/processed/ while preserving raw. Use whenever the user wants to process, crop, clean up, trim chrome from, or rename CCTV/낙상 videos in ml/data/{domain}/raw — including phone screen-recordings of monitoring apps (KakaoTalk-style) and raw DVR exports — even if they only say things like "영상 처리해줘", "영상 crop해줘", or "crop these videos".
---

# fall-video-crop-rename

Batch-process eldercare fall-CCTV videos in `ml/data/{domain}/raw/` (e.g.
`ml/data/nursing-home/raw/`): spatially crop each recording down to **only the CCTV
footage** (removing app/UI chrome), read the **on-screen capture date + location**, and
write a renamed **lossless** copy to `ml/data/{domain}/processed/`. Each
video is converted by its own **subagent**. Raw files are never modified and never
committed to git.

## Hard constraints (non-negotiable)
1. **No quality degradation** — encode mathematically lossless (`libx265 lossless=1`).
2. **Crop only** — spatial crop, no scaling / no fps change / **no frame drops**. A crop
   forces a re-encode; VFR sources drop frames unless you pass `-fps_mode passthrough`.
3. **Conversion via subagents** — one per video.
4. **Raw is sacred** — never modify `ml/data/{domain}/raw/`; raw/processed video must
   stay git-ignored (verify `.gitignore` blocks `ml/data` and `*.mp4`).

→ Full rationale, recipes, and md5 verification: **`references/ffmpeg-lossless.md`**.
→ Mistakes already made (read before starting): **`references/lessons-learned.md`**.

## Bundled scripts (the deterministic work — don't reinvent the flags)
| Script | Purpose |
|---|---|
| `scripts/detect_footage_box.py <video>` | **safe** auto-trim hint → `W:H:X:Y` or `NONE`; never over-crops |
| `scripts/crop_lossless.sh <in> <out> [W:H:X:Y]` | lossless VFR-safe crop; **no box ⇒ true `-c copy`** |
| `scripts/verify_lossless.sh <in> <out> [W:H:X:Y]` | md5 byte-parity + frame-count parity → `PASS`/`FAIL` |
| `scripts/read_fields_montage.py <raw_dir> <out_dir>` | per-field montage (date/시설명/호실) for batch faint-text reads |

Subagents call these scripts and rely on **exit codes**, not prose, for the contract.

## The crop decision — works for ANY incoming video
The user requirement: *whatever video comes in, losslessly crop out ONLY the camera
footage and drop the surrounding app/UI chrome.* Rule:

**Crop iff there is app/UI chrome or letterboxing around the footage.** If the
date/room is **baked into the footage pixels** (DVR burn-in) or the footage already fills
the frame, do NOT crop (cropping would destroy metadata / there's nothing to remove) →
use the no-box stream-copy path. Aspect ratio never decides; it only hints a start box.

**VISION is the authority for the box, because no pixel-only algorithm generalizes
safely.** (Motion-variance latches onto the moving subject and crops *into* the footage —
data loss, forbidden. `cropdetect`/uniform-trim only catch solid borders, missing colored
app chrome. Dark night CCTV defeats texture heuristics.) So the subagent **looks at a
sampled frame and reads off the footage rectangle**, which handles arbitrary UIs.

Procedure per video:
1. Run `detect_footage_box.py` for a **safe hint** (it returns a box only when confident
   about a uniform border, else `NONE` — it will never propose clipping real footage).
2. Extract a full frame and **visually confirm/adjust** the box so it encloses exactly
   the camera image: no header/tabs/date-strip/borders inside, and **no footage clipped**.
   Snap to even W/H/X/Y. If the footage fills the frame or carries a baked-in overlay,
   choose **no crop**.
3. **⚠ `verify_lossless.sh` proves the encode is bit-exact for the box you chose — it does
   NOT prove the box is correct.** Box correctness is verified by vision in step 5.
4. Cache the confirmed box by **resolution signature** (`WxH`) and reuse it for later
   videos of the same layout — measure each layout once.

Observed example boxes (illustrative, re-confirm by vision — NOT hardcodes):
- Portrait `1080×2520` KakaoTalk app → `crop=1080:668:0:650`.
- Landscape `2520×1080` with app banner → `crop=2520:970:0:110` (landscape still crops!).
- Small/odd `700×482` raw DVR, overlay baked in → **no crop**.

→ Pattern catalog + how to measure a new one: **`references/patterns.md`**.

## Reading the fields → `YYYY-MM-DD 시설명 호실.mp4`
- **date**: bottom **control strip**, beside the calendar icon (not the navbar).
- **시설명**: app **header** — a *location label*, usually `베스트요양원N` but can be a
  place like `4층휴게실`.
- **호실**: footage **TOP-LEFT** (not top-right), faint burn-in on dark footage.
- DVR overlay: date from the file path (`…/20211027/…`), facility from a code (`BEST_1`).
- Anything unreadable → `미상`. Use `scripts/read_fields_montage.py` for faint text.

→ Exact boxes + montage technique: **`references/field-reading.md`**.

## Output contract
- Folder `ml/data/{domain}/processed/` (create if missing); `ml/data/{domain}/raw/` untouched.
- Filename `YYYY-MM-DD 시설명 호실.mp4` (e.g. `2026-05-15 베스트요양원1 206호.mp4`).
- Missing field → `미상` (e.g. `2026-05-29 4층휴게실 미상.mp4`).
- Collision → append ` (2)`, ` (3)`, … (orchestrator owns naming).

## Workflow
1. `ffprobe` every file in `ml/data/{domain}/raw/` → record `width×height`; group by
   resolution signature so each layout's box is decided once and reused.
2. (Optional but recommended for faint rooms) run `read_fields_montage.py` once to read
   date/시설명/호실 across all clips at once.
3. For each video, spawn a **subagent** that:
   a. **Box**: run `detect_footage_box.py <in>` for a safe hint, extract a full frame,
      and **visually confirm/adjust** the crop box (encloses only footage, clips none) —
      or decide **no crop** (footage fills frame / baked-in overlay). Snap to even.
   b. Encodes to a **staging file named after the source basename** (race-free):
      `scripts/crop_lossless.sh <in> /staging/<basename>.mp4 [W:H:X:Y]`.
   c. Verifies the ENCODE: `scripts/verify_lossless.sh <in> /staging/<basename>.mp4 [box]`
      must print `PASS` (md5 + frame parity). On `FAIL`, re-do.
   d. Verifies the BOX by **vision**: extract a frame from the OUTPUT and confirm only
      footage remains (no chrome) and nothing was clipped. On mismatch, re-pick the box.
   e. Returns one-line JSON: `{in, out, box, date, 시설명, 호실, verify}`.
4. The **orchestrator** assigns canonical names deterministically from the JSON
   (applies `미상`, resolves collisions), then moves staging → `ml/data/{domain}/processed/`.
5. Print a summary table: per video → output filename, box, 미상 count, collisions, verify.

## Success criteria
- [ ] Every raw video → one file in `ml/data/{domain}/processed/`; raw unchanged.
- [ ] Cropped outputs contain **only** footage (no chrome); no-crop outputs are exact copies.
- [ ] Every output passes `verify_lossless.sh` (md5 + frame parity).
- [ ] Filenames follow `YYYY-MM-DD 시설명 호실.mp4`; unreadable → `미상`; collisions suffixed.
- [ ] No video added to git.

## Pitfalls (see references/lessons-learned.md for the full list)
- **Filename date ≠ capture date**: `KakaoTalk_Video_2026-06-07-*` is the *recording*
  date, not the CCTV date — always read the on-screen date.
- Don't read date/시설명 from the cropped footage — they live in the chrome.
- Verify with **md5 + frame count, never PSNR** (PSNR lies on VFR).
- Do mapping/renaming in **Python, not bash assoc arrays** (they break under zsh).
