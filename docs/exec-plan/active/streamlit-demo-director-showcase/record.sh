#!/usr/bin/env bash
# record.sh — external screen-capture harness for the director showcase.
#
# Why external capture (not in-app mp4): rules/streamlit-demo.md §2 forbids the
# demo's live-loop path from writing mp4 or calling st.video(). The showcase
# must therefore be a *screen recording* of the real Streamlit UI — capturing
# the genuine 🔴 낙상 status + 🚨 latched badge produced by real inference
# (ADR-005 §5: never fabricate detections). This script only drives ffmpeg's
# avfoundation screen grabber; it never touches the demo or its model seam.
#
# Prereq (one-time): grant Screen Recording permission to your terminal in
#   System Settings → Privacy & Security → Screen Recording.
# The avfoundation screen device on this Mac is index [3] ("Capture screen 0");
# re-verify with:  ffmpeg -f avfoundation -list_devices true -i ""
#
# Usage:
#   ./record.sh <clip-slug> [max-seconds]
# Example:
#   ./record.sh 505ho 90
#
# Then in the browser: press ▶︎ 재생, watch for the red 🔴 낙상 status and the
# 🚨 낙상 감지 badge, then press  q  in THIS terminal to stop the recording.
# Output: ~/Downloads/<clip-slug>_fall.mp4
set -euo pipefail

CLIP="${1:?usage: record.sh <clip-slug> [max-seconds]}"
MAXSEC="${2:-120}"
SCREEN_DEVICE="${SCREEN_DEVICE:-3}"   # avfoundation "Capture screen 0"
OUT="${HOME}/Downloads/${CLIP}_fall.mp4"

echo "▶ Recording screen device [${SCREEN_DEVICE}] → ${OUT}"
echo "  Max duration: ${MAXSEC}s.  Press  q  to stop early once the 🔴/🚨 fires."
echo

# -r 30      : 30 fps capture (smooth playback for the directors)
# -pix_fmt yuv420p + -movflags +faststart : QuickTime/Keynote/Slack-friendly mp4
# -t MAXSEC  : hard cap so a forgotten session can't fill the disk
exec ffmpeg -hide_banner -y \
  -f avfoundation -capture_cursor 1 -framerate 30 -i "${SCREEN_DEVICE}:none" \
  -t "${MAXSEC}" \
  -r 30 -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
  -movflags +faststart \
  "${OUT}"
