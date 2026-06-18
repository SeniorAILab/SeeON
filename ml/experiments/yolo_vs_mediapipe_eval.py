"""Empirical A/B: YOLO26-pose vs YOLO-box+MediaPipe on gold fall clips (issue #218).

Holds the classifier fixed (pose_angle) so the only variable is the pose source.
For each confirmed fall in ml/data/eval/nursing-home-gold.csv it runs both pose
backends over a window around the labelled fall and reports, per backend:
  - did the pose-angle classifier fire a fall, and how late vs the gold onset
  - pose availability: fraction of frames where shoulders+hips were recovered
  - mean torso angle in the post-fall region (lower = flatter = lying)

Usage: python experiments/yolo_vs_mediapipe_eval.py [--limit N] [--stride S]
"""
from __future__ import annotations

import argparse
import csv
import time
from pathlib import Path

from demo.classifier_module import FallClassifierModule
from demo.classifiers import ClassifierParams, PoseAngleClassifier
from demo.features import _CONF_THRESHOLD
from demo.model_modules import (
    YOLO_MEDIAPIPE_BACKEND,
    YOLO_POSE_BACKEND,
    MediaPipePoseModule,
    YoloPoseModule,
)
from demo.seam import ModelModule
from util.frame_source import VideoFileSource

ML_ROOT = Path(__file__).resolve().parent.parent
GOLD_CSV = ML_ROOT / "data" / "eval" / "nursing-home-gold.csv"
PROCESSED_DIR = ML_ROOT / "data" / "nursing-home" / "processed"

PRE_FALL_FRAMES = 60   # context before the labelled onset
POST_FALL_FRAMES = 150  # window after the labelled end to let the fall settle
SUSTAINED_SEC = 1.0     # pose_angle sustain (relaxed from 2.0 for short clips)
PERSON_CONF = 0.05      # matched detection eagerness for BOTH backends (fair A/B)
_SHOULDER_IDX = (5, 6)
_HIP_IDX = (11, 12)


def _has_torso(kpts) -> bool:
    sh = any(i < len(kpts) and kpts[i][2] >= _CONF_THRESHOLD for i in _SHOULDER_IDX)
    hip = any(i < len(kpts) and kpts[i][2] >= _CONF_THRESHOLD for i in _HIP_IDX)
    return sh and hip


def _torso_angle(kpts) -> float | None:
    import math

    sh = [kpts[i] for i in _SHOULDER_IDX if i < len(kpts) and kpts[i][2] >= _CONF_THRESHOLD]
    hip = [kpts[i] for i in _HIP_IDX if i < len(kpts) and kpts[i][2] >= _CONF_THRESHOLD]
    if not sh or not hip:
        return None
    sx = sum(p[0] for p in sh) / len(sh)
    sy = sum(p[1] for p in sh) / len(sh)
    hx = sum(p[0] for p in hip) / len(hip)
    hy = sum(p[1] for p in hip) / len(hip)
    dx, dy = abs(hx - sx), abs(hy - sy)
    if dx == 0 and dy == 0:
        return 90.0
    return math.degrees(math.atan2(dy, dx))


def _run_backend(backend: str, path: Path, fps: float, fall_start: int, fall_end: int, stride: int):
    start_sec = max(0.0, (fall_start - PRE_FALL_FRAMES) / fps)
    end_frame = fall_end + POST_FALL_FRAMES
    params = ClassifierParams(sustained_down_sec=SUSTAINED_SEC, confidence=PERSON_CONF)
    if backend == YOLO_MEDIAPIPE_BACKEND:
        pose: ModelModule = MediaPipePoseModule(size="n", confidence=PERSON_CONF)
    else:
        pose = YoloPoseModule(size="n", confidence=PERSON_CONF)
    model = FallClassifierModule(pose, PoseAngleClassifier(params))
    source = VideoFileSource(path, start_sec=start_sec, frame_stride=stride)

    total = pose_ok = 0
    first_fire_frame: int | None = None
    post_angles: list[float] = []
    for frame in source:
        raw_frame = int(round(frame.time_sec * fps))
        if raw_frame > end_frame:
            break
        result = model.predict(frame)
        total += 1
        if result.keypoints and _has_torso(result.keypoints[0]):
            pose_ok += 1
            if raw_frame >= fall_end:
                angle = _torso_angle(result.keypoints[0])
                if angle is not None:
                    post_angles.append(angle)
        if result.labels and result.labels[0].is_fall and first_fire_frame is None:
            first_fire_frame = raw_frame
    pose_avail = pose_ok / total if total else 0.0
    mean_post_angle = sum(post_angles) / len(post_angles) if post_angles else None
    return {
        "fired": first_fire_frame is not None,
        "first_fire_frame": first_fire_frame,
        "latency_frames": (first_fire_frame - fall_start) if first_fire_frame is not None else None,
        "pose_avail": pose_avail,
        "mean_post_angle": mean_post_angle,
        "frames": total,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max clips (0 = all)")
    ap.add_argument("--stride", type=int, default=3, help="frame subsample stride")
    ap.add_argument("--data-root", type=str, default=str(ML_ROOT / "data"),
                    help="ml/data root holding eval/ + nursing-home/processed/")
    args = ap.parse_args()

    import unicodedata

    data_root = Path(args.data_root)
    gold_csv = data_root / "eval" / "nursing-home-gold.csv"
    processed_dir = data_root / "nursing-home" / "processed"
    # macOS stores Korean filenames NFD; the CSV may be NFC — match by NFC key.
    by_nfc = {unicodedata.normalize("NFC", p.name): p for p in processed_dir.glob("*.mp4")}

    rows = [r for r in csv.DictReader(gold_csv.read_text().splitlines()) if r["status"] == "confirmed"]
    resolved = []
    for r in rows:
        clip = by_nfc.get(unicodedata.normalize("NFC", f"{r['video']}.mp4"))
        if clip is not None:
            resolved.append((r, clip))
    rows = resolved
    if args.limit:
        rows = rows[: args.limit]

    backends = {"yolo-pose": YOLO_POSE_BACKEND, "yolo+mediapipe": YOLO_MEDIAPIPE_BACKEND}
    agg = {name: {"fired": 0, "pose_sum": 0.0, "angle_sum": 0.0, "angle_n": 0, "lat": []}
           for name in backends}

    print(f"clips={len(rows)} stride={args.stride}\n")
    for r, path in rows:
        fps = float(r["fps"])
        fs, fe = int(r["fall_start_frame"]), int(r["fall_end_frame"])
        print(f"== {r['video']}  fps={fps:.1f} fall[{fs}-{fe}]")
        for name, backend in backends.items():
            t0 = time.perf_counter()
            res = _run_backend(backend, path, fps, fs, fe, args.stride)
            dt = time.perf_counter() - t0
            lat = res["latency_frames"]
            lat_s = f"{lat / fps:+.2f}s" if lat is not None else "  —  "
            ang = f"{res['mean_post_angle']:.0f}°" if res["mean_post_angle"] is not None else " —"
            print(f"   {name:14s} fired={'Y' if res['fired'] else 'n'} "
                  f"lat={lat_s} pose_avail={res['pose_avail']*100:4.0f}% "
                  f"post_angle={ang:>4s} ({res['frames']}f, {dt:.1f}s)")
            if res["fired"]:
                agg[name]["fired"] += 1
                if lat is not None:
                    agg[name]["lat"].append(lat / fps)
            agg[name]["pose_sum"] += res["pose_avail"]
            if res["mean_post_angle"] is not None:
                agg[name]["angle_sum"] += res["mean_post_angle"]
                agg[name]["angle_n"] += 1

    n = len(rows)
    print("\n===== SUMMARY =====")
    for name in backends:
        a = agg[name]
        mlat = sum(a["lat"]) / len(a["lat"]) if a["lat"] else None
        mang = a["angle_sum"] / a["angle_n"] if a["angle_n"] else None
        print(f"{name:14s} detected {a['fired']}/{n}  "
              f"mean_pose_avail={a['pose_sum']/n*100:.0f}%  "
              f"mean_post_angle={mang:.0f}°  " if mang is not None else
              f"{name:14s} detected {a['fired']}/{n}  mean_pose_avail={a['pose_sum']/n*100:.0f}%  ")
        if mlat is not None:
            print(f"{'':14s} mean_detect_latency={mlat:+.2f}s")


if __name__ == "__main__":
    main()
