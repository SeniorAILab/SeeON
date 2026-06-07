# Reading the on-screen fields (date / 시설명 / 호실)

Goal: produce the filename `YYYY-MM-DD 시설명 호실.mp4`. Each piece comes from a
different on-screen region. Use `미상` for anything you cannot read.

## Where each field lives (KakaoTalk portrait 1080×2520)
| Field | Location | Approx box `x,y,w,h` | Notes |
|---|---|---|---|
| date | bottom **control strip**, beside the calendar icon | `300,1990,600,100` | NOT the navbar; first attempt at y≈2120 was blank |
| 시설명 / location | app **header** (top) | `190,150,700,110` | a *location label* — usually `베스트요양원N`, but can be a place like `4층휴게실` |
| 호실 (room) | footage **TOP-LEFT** | `0,648,420,100` | **top-left**, not top-right; faint burn-in on dark footage |

> The header is a generic location label, not always `베스트요양원N`. When the header
> is itself the location (e.g. a lounge `4층휴게실`) there may be **no 호실** → `미상`.

## Burnt-in DVR overlay (e.g. 700×482 raw export)
No app chrome; the overlay is part of the footage. Pull fields from the overlay text
and the file path:
- date from the path, e.g. `…/20211027/…` → `2021-10-27`.
- facility from a code like `BEST_1` → `베스트요양원1`.
- room from the overlay, e.g. `505호`.

## The montage technique (for faint text across many videos)
Reading dark night footage one frame at a time is unreliable. Instead batch it:

```
scripts/read_fields_montage.py <raw_dir> <out_dir> [--ss 2] [--only 1080x2520]
```
Produces `montage_date.png`, `montage_facility.png`, `montage_room.png`: the same region
from every video, **autocontrast + 2× upscaled**, stacked with a red row index. Open the
3 images and read down each column. The printed `row index -> video` map ties each row
back to its source file.

- Adjust the boxes in `DEFAULT_REGIONS` (top of the script) for a new layout.
- `--only any` processes all sizes; default filters to the portrait pattern.
- Deliberately PIL-only (no numpy) — see lessons-learned #9.

## Filename assembly rules
- Format: `YYYY-MM-DD 시설명 호실.mp4` (single spaces).
- Missing field → `미상` in that slot (e.g. `2026-05-29 4층휴게실 미상.mp4`).
- Collisions → append ` (2)`, ` (3)`, … (the orchestrator owns this; see SKILL.md).
- Assign names **after** encoding, from a staging file, to stay race-free.
