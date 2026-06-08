#!/usr/bin/env python3
"""read_fields_montage.py — batch-read faint on-screen fields across many videos.

The room number (호실) and sometimes the date are baked into dark, low-texture night
footage and are unreadable from a downscaled full frame. Reading them one video at a
time is slow and error-prone. This builds one tall montage PER FIELD (date / 시설명 /
호실) by stacking the same cropped region from every video, with autocontrast + 2x
upscale so faint text becomes legible. You then read 3 images instead of N frames.

Defaults target the measured KakaoTalk portrait pattern (1080x2520). For other layouts,
pass --regions or measure the boxes once and re-run.

Usage:
  read_fields_montage.py <raw_dir> <out_dir> [--ss 2] [--only 1080x2520]

Deps: ffmpeg/ffprobe on PATH, Pillow (PIL). Deliberately AVOIDS numpy — numpy 2.0
removed ndarray.ptp() and similar gotchas bit us before; PIL alone is enough here.
"""
import argparse, glob, os, subprocess, sys
from PIL import Image, ImageOps, ImageDraw

# (name, (x, y, w, h)) for the KakaoTalk portrait 1080x2520 pattern.
DEFAULT_REGIONS = {
    "date":   (300, 1990, 600, 100),   # bottom control strip, beside the calendar icon
    "facility": (190, 150, 700, 110),  # app header (시설명 or a location label)
    "room":   (0, 648, 420, 100),      # footage TOP-LEFT (호실) — NOT top-right
}

def probe_size(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True).stdout.strip()
    try:
        w, h = out.split(",")[:2]
        return int(w), int(h)
    except Exception:
        return None

def extract_frame(path, ss, dst):
    subprocess.run(["ffmpeg", "-y", "-ss", str(ss), "-i", path,
                    "-frames:v", "1", dst, "-loglevel", "error"], check=True)

def enhance(crop):
    g = ImageOps.autocontrast(crop.convert("L"), cutoff=1)
    return g.resize((g.width * 2, g.height * 2)).convert("RGB")

def build(field, region, frames, out_dir):
    x, y, w, h = region
    crops = [enhance(Image.open(png).crop((x, y, x + w, y + h))) for _, png in frames]
    if not crops:
        return None
    rw, rh = crops[0].size
    canvas = Image.new("RGB", (70 + rw, rh * len(crops)), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    for j, img in enumerate(crops):
        yy = j * rh
        canvas.paste(img, (70, yy))
        d.line([0, yy, canvas.width, yy], fill=(255, 0, 0))
        d.text((6, yy + rh // 2 - 4), str(j), fill=(255, 0, 0))
    out = os.path.join(out_dir, f"montage_{field}.png")
    canvas.save(out)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--ss", default=2, type=float, help="seek seconds for the sample frame")
    ap.add_argument("--only", default="1080x2520",
                    help="WxH filter (default portrait pattern); use 'any' for all")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    tmp = os.path.join(args.out_dir, "_frames")
    os.makedirs(tmp, exist_ok=True)

    want = None if args.only == "any" else tuple(int(v) for v in args.only.lower().split("x"))
    vids = sorted(v for ext in ("mp4", "mov", "MP4", "MOV")
                  for v in glob.glob(os.path.join(args.raw_dir, f"*.{ext}")))
    frames = []
    for v in vids:
        if want and probe_size(v) != want:
            continue
        base = os.path.splitext(os.path.basename(v))[0]
        png = os.path.join(tmp, base + ".png")
        extract_frame(v, args.ss, png)
        frames.append((base, png))

    if not frames:
        print(f"No videos matching size {args.only} in {args.raw_dir}", file=sys.stderr)
        sys.exit(1)

    for field, region in DEFAULT_REGIONS.items():
        out = build(field, region, frames, args.out_dir)
        print(f"{field}: {out}")
    print("\nrow index -> video:")
    for i, (base, _) in enumerate(frames):
        print(f"  {i}: {base}")

if __name__ == "__main__":
    main()
