#!/usr/bin/env python3
"""detect_footage_box.py — SAFE auto-trim of uniform borders. A HINT, not the truth.

Goal: handle "any video, crop only the footage, never degrade quality." A crop that cuts
INTO real footage is data loss and is forbidden — so this tool is deliberately
conservative: it only proposes removing a near-UNIFORM border band (black/white/solid
letterbox or a solid app bar) that it is confident about, and otherwise prints NONE. It
will NEVER return a box that clips textured content. The authoritative box decision is
made by the calling subagent VISUALLY (see SKILL.md) — vision generalizes to colored app
chrome and dark CCTV where pixel heuristics do not. Treat this output as a first guess to
be visually confirmed.

Why not motion-variance? Dark night footage has near-zero temporal variance and the
detector latches onto the moving *subject*, returning a box INSIDE the footage -> it
would delete real footage. Why not raw cropdetect? It only strips near-black borders and
ignores white/colored app headers. Both fail the "never lose footage" bar, so we fall
back to NONE whenever not confident.

Output (stdout, one line):
  W:H:X:Y   -> confident uniform-border trim (even-numbered), feed to crop_lossless.sh
  NONE      -> not confident / footage fills frame; do NOT auto-crop (use vision)

Usage: detect_footage_box.py <video> [--frames 9] [--uniform-std 6] [--min-band 0.03]

Deps: ffmpeg/ffprobe, numpy, Pillow.
"""
import argparse, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image


def probe_size(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True).stdout.strip()
    w, h = out.split(",")[:2]
    return int(w), int(h)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def median_frame(path, n, tmp):
    """Median of n grayscale samples -> denoised representative frame."""
    dur = duration(path)
    times = [max(0.0, dur * (i + 0.5) / n) for i in range(n)] if dur > 0 else [0.0]
    imgs = []
    for i, t in enumerate(times):
        dst = os.path.join(tmp, f"f{i:03d}.png")
        subprocess.run(["ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", path,
                        "-frames:v", "1", "-pix_fmt", "gray", dst,
                        "-loglevel", "error"], check=True)
        if os.path.exists(dst):
            imgs.append(np.asarray(Image.open(dst).convert("L"), dtype=np.float32))
    if not imgs:
        return None
    h0 = min(a.shape[0] for a in imgs); w0 = min(a.shape[1] for a in imgs)
    imgs = [a[:h0, :w0] for a in imgs]
    return np.median(np.stack(imgs, 0), axis=0)


def even(v):
    v = int(round(v)); return v - (v % 2)


def trim_uniform(med, uniform_std):
    """Return (top, bottom, left, right) counts of confidently-uniform border lines.
    A border line is 'uniform' iff its spatial std is tiny (a solid bar). We stop at the
    first non-uniform line, so we never eat into textured footage."""
    h, w = med.shape
    def uniform_row(y): return float(med[y, :].std()) <= uniform_std
    def uniform_col(x): return float(med[:, x].std()) <= uniform_std
    top = 0
    while top < h and uniform_row(top): top += 1
    bot = 0
    while bot < h - top and uniform_row(h - 1 - bot): bot += 1
    left = 0
    while left < w and uniform_col(left): left += 1
    right = 0
    while right < w - left and uniform_col(w - 1 - right): right += 1
    return top, bot, left, right


def detect(path, n_frames, uniform_std, min_band):
    W, H = probe_size(path)
    with tempfile.TemporaryDirectory() as tmp:
        med = median_frame(path, n_frames, tmp)
    if med is None:
        return "NONE"
    h0, w0 = med.shape
    top, bot, left, right = trim_uniform(med, uniform_std)

    # require a meaningful band before we bother cropping; tiny trims aren't worth it
    if max(top, bot) < min_band * h0 and max(left, right) < min_band * w0:
        return "NONE"

    x0, y0 = left, top
    bw, bh = (w0 - left - right), (h0 - top - bot)
    if bw <= 0 or bh <= 0:
        return "NONE"

    sx, sy = W / w0, H / h0
    bx, by = even(x0 * sx), even(y0 * sy)
    cw, ch = even(bw * sx), even(bh * sy)
    cw = min(cw, W - bx); ch = min(ch, H - by)
    if cw <= 0 or ch <= 0:
        return "NONE"
    if bx == 0 and by == 0 and cw >= W - 2 and ch >= H - 2:
        return "NONE"  # nothing trimmed
    return f"{cw}:{ch}:{bx}:{by}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--frames", type=int, default=9)
    ap.add_argument("--uniform-std", type=float, default=6.0,
                    help="max spatial std for a border line to count as a solid bar")
    ap.add_argument("--min-band", type=float, default=0.03,
                    help="min border thickness (fraction of dim) worth trimming")
    args = ap.parse_args()
    try:
        print(detect(args.video, args.frames, args.uniform_std, args.min_band))
    except subprocess.CalledProcessError as e:
        print(f"ERROR: ffmpeg/ffprobe failed: {e}", file=sys.stderr); sys.exit(2)


if __name__ == "__main__":
    main()
