# ffmpeg: lossless, frame-exact crop + verification

The hard constraints: **no quality degradation, crop only (no scaling/fps/frame-drop),
raw never modified.** The bundled scripts encode the contract; this is the rationale.

## Why a crop must be re-encoded (and why that's dangerous)
A crop changes pixel dimensions, so the bitstream cannot be stream-copied — ffmpeg
re-encodes. Two silent failure modes bit us:
1. **Lossy default**: default re-encode = lossy CRF. → force `libx265 lossless=1`.
2. **Frame drop on VFR**: phone recordings are variable-frame-rate; ffmpeg's default
   resamples VFR→CFR and drops frames (994→850). → force `-fps_mode passthrough`.

## The crop recipe (`crop_lossless.sh`)
```bash
ffmpeg -y -i "$in" -filter:v "crop=W:H:X:Y" \
  -c:v libx265 -x265-params lossless=1 -preset fast -pix_fmt yuv420p \
  -fps_mode passthrough -tag:v hvc1 -c:a copy "$out"
```
- `lossless=1` → mathematically lossless x265.
- `-fps_mode passthrough` → keep every frame + original timestamps (no resample).
- `-tag:v hvc1` → QuickTime/Apple players recognize the HEVC stream.
- `-c:a copy` → audio untouched.
- `-pix_fmt yuv420p` → matches the source chroma; do not introduce conversion.

## The no-crop recipe (baked-in overlay / already just footage)
```bash
ffmpeg -y -i "$in" -c copy "$out"   # true stream copy, zero re-encode
```
Use when there's no chrome to remove, or when the metadata is burnt into the footage
(cropping would destroy it). This is byte-for-byte the original stream.

## Verifying losslessness — md5, NOT psnr (`verify_lossless.sh`)
The ffmpeg `psnr` filter pairs frames by PTS and **mis-pairs on VFR**, reporting finite
PSNR even for a perfect encode. Don't trust it. Instead compare the decoded YUV md5 and
the frame count:
```bash
# crop case: apply the SAME crop to the input before hashing
md5_in=$(ffmpeg -i in.mp4 -vf "crop=W:H:X:Y" -vsync 0 -f rawvideo -pix_fmt yuv420p - | md5)
md5_out=$(ffmpeg -i out.mp4            -vsync 0 -f rawvideo -pix_fmt yuv420p - | md5)
# frame parity
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=nb_read_frames -of csv=p=0 in.mp4   # == out.mp4
```
PASS = md5 equal **and** frame counts equal. The whole 23-clip run passed this.

## Compatibility note
Lossless HEVC is large and not universally playable. `-tag:v hvc1` covers Apple
players; for a strictly-compatible viewer copy, transcode separately — never overwrite
the lossless master, and never touch raw.
