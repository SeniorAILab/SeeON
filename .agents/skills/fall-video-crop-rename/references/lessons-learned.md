# Lessons learned — anti-patterns from the first real run

These are mistakes that actually happened processing the 23-video corpus. Each cost a
re-run or a wrong result. Read this *before* you start; every item maps to a concrete
rule already wired into the scripts/SKILL workflow. Do not rediscover them.

## 1. A crop forces a re-encode — and the default re-encode is LOSSY
A spatial crop changes pixel bounds, so the stream cannot be copied; ffmpeg must
re-encode. The default re-encode uses a lossy CRF (often re-coding HEVC→H.264). The
source here is already HEVC, so the loss is invisible in a glance but real.
→ **Always `libx265 -x265-params lossless=1`.** Never rely on defaults. (`crop_lossless.sh`)

## 2. VFR sources silently DROP frames without `-fps_mode passthrough`
Phone screen-recordings are variable-frame-rate. ffmpeg's default resamples VFR→CFR,
which dropped 994→850 frames on the first encode — a "crop" that deleted ~15% of the
footage, including possibly the fall moment. This is the single most dangerous bug.
→ **Always `-fps_mode passthrough`.** Verify frame count parity after every encode.

## 3. PSNR is a LIAR on VFR — verify with md5, not PSNR
The ffmpeg `psnr` filter pairs frames by PTS; on VFR it mis-pairs and reports finite
PSNR (~42 dB) even when the encode is bit-perfect. We almost concluded "lossy" from a
lossless output.
→ **Verify losslessness by md5 of the decoded YUV + `nb_read_frames` parity.** Never
trust PSNR here. (`verify_lossless.sh`)

## 4. 호실 is at footage TOP-LEFT, not top-right
The original skill said the room number was burnt-in top-right. Every actual room label
(206호, 205호, …) was at the **top-left** of the footage region.
→ See `references/field-reading.md` for exact boxes.

## 5. "Landscape ⇒ no crop" is WRONG — crop on chrome, not aspect ratio
The original rule was "2520×1080 landscape = already footage, skip crop." But the
landscape hospital_1 had a white app banner and needed `crop=2520:970:0:110`.
→ **The crop decision is: is there app chrome / UI around the footage? If yes, crop it
out. Aspect ratio only hints which measured box to start from.** (`references/patterns.md`)

## 6. The date is in the bottom CONTROL STRIP, not the navbar
First date crop (y≈2120) came back blank. The date actually sits at the top of the
bottom control strip, next to a calendar icon (~y1990–2090 in 1080×2520).
→ See `references/field-reading.md`.

## 7. Some footage has a BAKED-IN overlay — cropping destroys metadata
hospital_3 is a raw DVR export (700×482) with date/room burnt into the footage pixels.
There is no app chrome to remove, and cropping would cut off the very overlay that
carries the metadata. Its date came from the file path (`…/20211027/…`), facility from
`BEST_1`.
→ **If the date/room is baked into the footage itself, do NOT crop — stream-copy.**
(`crop_lossless.sh` with no box = true `-c copy`.)

## 8. Faint night-footage text is unreadable one frame at a time
Room numbers on dark, low-texture night footage are illegible in a downscaled full
frame. Reading 23 videos one-by-one was slow and error-prone.
→ **Build a per-field montage (date/시설명/호실) across all videos, autocontrast +
2× upscale, then read 3 images.** (`scripts/read_fields_montage.py`)

## 9. numpy 2.0 removed `ndarray.ptp()`
A montage helper using `arr.ptp()` crashed on numpy 2.0.
→ Use `np.ptp(arr)` if you must, but the shipped script **avoids numpy entirely** and
uses PIL — fewer version traps.

## 10. bash associative arrays fail under zsh (`bad substitution`)
A `declare -A MAP=(...)` rename script broke in the user's zsh.
→ **Do renaming/mapping in Python, not bash assoc arrays.** Keep bash for the ffmpeg
calls only.

## 12. No pixel-only algorithm finds the footage box safely — vision does
We tried to auto-detect the crop box so it would work for *any* video:
- **Temporal motion-variance** (footage moves, chrome is static): on dark CCTV the
  variance is near-zero and it instead boxed the moving *subject* — a box INSIDE the
  footage. Cropping to that would DELETE real footage. Unacceptable.
- **ffmpeg `cropdetect` / uniform-border trim**: only removes near-uniform borders
  (mostly black); it left the white KakaoTalk header in place. Safe but too weak.
→ **Vision is the box authority.** `detect_footage_box.py` is kept only as a *safe hint*
that returns `NONE` whenever unsure (never over-crops). And remember: `verify_lossless.sh`
proves the *encode* is lossless for the chosen box, NOT that the box itself is correct —
only vision confirms "footage only, nothing clipped."

## 11. Subagent text return channel is flaky — use exit codes + staging
Relying on a subagent's prose return to carry the result was unreliable.
→ **Contract = script exit codes + a one-line JSON.** Encode to a staging file named
after the source basename, then have the orchestrator assign canonical names
deterministically afterward (race-free, collision-safe). See SKILL.md workflow.
