#!/usr/bin/env bash
# crop_lossless.sh — spatial crop ONLY, with zero quality loss and zero dropped frames.
#
# Why this exists: a crop changes pixel bounds, so it cannot be stream-copied — a re-encode
# is forced. A *default* re-encode silently degrades quality (lossy CRF, often re-coded to
# H.264) and, on variable-frame-rate phone screen-recordings, silently DROPS frames when
# ffmpeg resamples VFR->CFR. Both happened during development. This script encodes
# mathematically lossless (x265 lossless=1) and preserves every original frame+timestamp
# (-fps_mode passthrough), so the output pixels are bit-identical to the cropped source.
#
# Usage:
#   crop_lossless.sh <in> <out> <W:H:X:Y>   # lossless crop
#   crop_lossless.sh <in> <out>             # no crop -> TRUE stream copy (no re-encode at all)
#
# Use the no-crop form for footage that already fills the frame OR whose date/room is a
# burnt-in overlay baked into the pixels (cropping would destroy that metadata).
set -euo pipefail
in=${1:?usage: crop_lossless.sh <in> <out> [W:H:X:Y]}
out=${2:?usage: crop_lossless.sh <in> <out> [W:H:X:Y]}
box=${3:-}

if [[ -n "$box" ]]; then
  ffmpeg -y -i "$in" -filter:v "crop=$box" \
    -c:v libx265 -x265-params lossless=1 -preset fast -pix_fmt yuv420p \
    -fps_mode passthrough -tag:v hvc1 -c:a copy "$out"
else
  ffmpeg -y -i "$in" -c copy "$out"
fi
