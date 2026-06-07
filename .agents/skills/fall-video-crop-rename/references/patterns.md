# Layout patterns & the crop decision

## The one rule that drives everything
**Crop iff there is app/UI chrome (or letterboxing) around the actual CCTV footage.**
Aspect ratio does NOT decide whether to crop — it only hints *which* measured box to
start from. If the date/room is **baked into the footage pixels** (a DVR burn-in), do
NOT crop, because the crop would cut off the metadata.

```
size? ─┬─ 1080×2520 portrait  → KakaoTalk screen-recording → crop footage region
       ├─ 2520×1080 landscape → may still have an app banner → crop chrome if present
       └─ small/odd (e.g.700×482) → likely raw DVR w/ burnt-in overlay → DO NOT crop
```

## Observed patterns (concrete examples — NOT hardcodes)
These are starting boxes measured this run. Re-measure if the UI differs.

| Pattern | Source size | Chrome? | Crop box `W:H:X:Y` | Notes |
|---|---|---|---|---|
| KakaoTalk portrait | 1080×2520 | yes (app header + bottom strip) | `1080:668:0:650` | footage is a band below the header; 20/23 clips + the lounge clip |
| Hospital banner | 2520×1080 | yes (white app banner on top) | `2520:970:0:110` | landscape but still needs a crop |
| Raw DVR | 700×482 | no — overlay baked in | *(none — stream copy)* | date/room burnt into pixels; crop would destroy metadata |

## Handling an UNKNOWN video (the general case)
The requirement is to crop only the footage out of *any* incoming video, losslessly.
There is **no reliable pixel-only algorithm** for this, so vision decides the box:

1. Get a **safe hint**: `scripts/detect_footage_box.py <video>` → `W:H:X:Y` or `NONE`.
   It only proposes trimming a border it is *confident* is a solid uniform bar, and
   returns `NONE` otherwise — it will **never** propose a box that clips textured footage.
2. **Vision confirms/adjusts** the box from a sampled frame (this is authoritative).
3. Crop with `crop_lossless.sh`, then **vision-verify the output** frame: only footage,
   nothing clipped. `verify_lossless.sh` only proves the *encode* is lossless, not that
   the box is right.

### Why not a pure algorithm? (don't retry these — they were tested and rejected)
- **Temporal motion-variance** → latches onto the moving *subject*, returns a box INSIDE
  the footage → deletes real footage. Forbidden.
- **ffmpeg `cropdetect` / uniform-border trim** → only catches near-uniform (esp. black)
  borders; misses white/colored app headers and text strips. Safe but weak — that's why
  `detect_footage_box.py` is a hint, not the decision.
- Dark, low-texture night CCTV breaks every texture/variance threshold in both directions.

## How to measure a KNOWN pattern (once per layout, then reuse)
1. Extract a representative frame: `ffmpeg -ss 2 -i in.mp4 -frames:v 1 /tmp/f.png`.
2. Open it; find the footage rectangle's top-left `(X,Y)` and its `W×H`.
   - Quick sweep: try a box, run `crop_lossless.sh` to a temp file, eyeball the first
     frame, adjust. `ffprobe` gives you the full `width,height` to anchor against.
3. Confirm the box removes ALL chrome and clips NONE of the footage.
4. Record it here keyed by **resolution signature** (`WxH`), then reuse for that layout.

## Gotchas
- A landscape clip is **not** automatically chrome-free (hospital banner proved this).
- A clip that "looks like just footage" may still have a 1–2px letterbox; verify.
- Burnt-in overlays look like chrome but are part of the footage — never crop those.
