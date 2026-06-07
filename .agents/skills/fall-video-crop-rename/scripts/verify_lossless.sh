#!/usr/bin/env bash
# verify_lossless.sh — prove the crop was lossless AND dropped no frames.
#
# Do NOT trust the ffmpeg `psnr` filter here: it pairs frames by PTS, and on VFR sources it
# mis-pairs them, reporting finite PSNR even when the encode is perfectly lossless. The
# reliable check is byte-identity of the DECODED YUV plus a frame-count match.
#
# Usage: verify_lossless.sh <in> <out> [W:H:X:Y]
#   Pass the SAME crop box you used in crop_lossless.sh. Omit it for the no-crop path.
set -euo pipefail
in=${1:?usage: verify_lossless.sh <in> <out> [W:H:X:Y]}
out=${2:?usage: verify_lossless.sh <in> <out> [W:H:X:Y]}
box=${3:-}

# portable md5 (macOS `md5 -q`, Linux `md5sum`)
hash() { if command -v md5 >/dev/null 2>&1; then md5 -q; else md5sum | cut -d' ' -f1; fi; }

vf=(); [[ -n "$box" ]] && vf=(-vf "crop=$box")
md5_in=$(ffmpeg -i "$in" "${vf[@]}" -vsync 0 -f rawvideo -pix_fmt yuv420p - 2>/dev/null | hash)
md5_out=$(ffmpeg -i "$out" -vsync 0 -f rawvideo -pix_fmt yuv420p - 2>/dev/null | hash)
fr_in=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$in")
fr_out=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$out")

if [[ "$md5_in" == "$md5_out" && "$fr_in" == "$fr_out" ]]; then
  echo "PASS | frames ${fr_in}==${fr_out} | md5 match (${md5_in:0:8})"
  exit 0
fi
echo "FAIL | frames ${fr_in} vs ${fr_out} | md5 ${md5_in:0:8} vs ${md5_out:0:8}"
exit 1
