"""Convention-independent detection rate: did each backend emit a pose at all?

Answers the fairness objection to yolo_vs_mediapipe_eval.py: that experiment
applied a COCO-tuned conf>=0.2 filter and a single angle threshold to BOTH
backends, but YOLO-pose's per-keypoint confidence and MediaPipe's visibility are
different quantities and the joints differ. Here we drop every threshold and the
classifier, and measure only the binary "a pose was produced this frame":

  - yolo_pose_box%   : YOLO26-pose emits >=1 person (raw box), full frame
  - yolo_det_box%    : YOLO26 detection emits >=1 person (hybrid gate 1)
  - mp_given_box%    : of frames WITH a YOLO-det box, MediaPipe returns a pose
                       (hybrid gate 2 — pure pose-detection on the same crop)
  - hybrid_pose%     : MediaPipe returns a pose overall (gate1 AND gate2)

None of these use a confidence threshold, joint remap, or the classifier, so the
gap (if any) reflects raw detection capability, not output-format mismatch.

Usage: python experiments/pose_detection_rate.py --data-root <ml/data> [--samples N]
"""
from __future__ import annotations

import argparse
import unicodedata
from pathlib import Path

import cv2
import numpy as np

from demo.mediapipe_pose import MediaPipePoseEstimator
from demo.model_modules import person_weight_path, pose_weight_path
from demo.yolo_runtime import YoloPersonRunner, YoloPoseRunner

ML_ROOT = Path(__file__).resolve().parent.parent
PERSON_CONF = 0.05  # same eagerness for both YOLO heads


def _sample_frames(path: Path, n: int) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    idxs = [int(i * total / n) for i in range(n)]
    frames = []
    for fno in idxs:
        cap.set(cv2.CAP_PROP_POS_FRAMES, fno)
        ok, bgr = cap.read()
        if ok:
            frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    cap.release()
    return frames


def _measure(frames, pose_runner, person_runner, estimator) -> dict:
    yolo_pose_box = yolo_det_box = mp_pose = mp_given_box = 0
    for rgb in frames:
        _, pose_boxes = pose_runner.predict_full(rgb)
        if pose_boxes:
            yolo_pose_box += 1
        det_boxes = person_runner.detect_persons(rgb)
        if det_boxes:
            yolo_det_box += 1
            x1, y1, x2, y2, _ = det_boxes[0]
            roi = np.ascontiguousarray(rgb[max(0, y1):y2, max(0, x1):x2])
            if roi.shape[0] > 0 and roi.shape[1] > 0 and estimator.infer(roi) is not None:
                mp_pose += 1
                mp_given_box += 1
    n = len(frames) or 1
    return {
        "n": n,
        "yolo_pose_box": yolo_pose_box / n,
        "yolo_det_box": yolo_det_box / n,
        "hybrid_pose": mp_pose / n,
        "mp_given_box": (mp_given_box / yolo_det_box) if yolo_det_box else 0.0,
    }


def _clips_nursing(data_root: Path) -> list[Path]:
    pdir = data_root / "nursing-home" / "processed"
    return sorted(pdir.glob("*.mp4"))


def _clips_le2i(data_root: Path) -> list[Path]:
    return sorted((data_root / "le2i" / "raw" / "Home").glob("*.avi"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=str(ML_ROOT / "data"))
    ap.add_argument("--samples", type=int, default=30, help="frames sampled per clip")
    ap.add_argument("--le2i", type=int, default=8, help="le2i clips to sample")
    args = ap.parse_args()
    data_root = Path(args.data_root)

    pose_runner = YoloPoseRunner(model_path=str(pose_weight_path("n")), confidence=PERSON_CONF)
    person_runner = YoloPersonRunner(model_path=str(person_weight_path("n")), confidence=PERSON_CONF)
    estimator = MediaPipePoseEstimator()

    for label, clips in (
        ("NURSING-HOME CCTV", _clips_nursing(data_root)),
        ("LE2I Home", _clips_le2i(data_root)[: args.le2i]),
    ):
        if not clips:
            print(f"\n[{label}] no clips found")
            continue
        agg = {"yolo_pose_box": 0.0, "yolo_det_box": 0.0, "hybrid_pose": 0.0, "mp_given_box": 0.0}
        print(f"\n===== {label} ({len(clips)} clips, {args.samples} frames each) =====")
        print(f"{'clip':36s} yolo_pose  yolo_det  mp|box  hybrid")
        for clip in clips:
            frames = _sample_frames(clip, args.samples)
            r = _measure(frames, pose_runner, person_runner, estimator)
            name = unicodedata.normalize("NFC", clip.stem)[:34]
            print(f"{name:36s} {r['yolo_pose_box']*100:7.0f}% {r['yolo_det_box']*100:7.0f}% "
                  f"{r['mp_given_box']*100:6.0f}% {r['hybrid_pose']*100:6.0f}%")
            for k in agg:
                agg[k] += r[k]
        m = len(clips)
        print(f"{'MEAN':36s} {agg['yolo_pose_box']/m*100:7.0f}% {agg['yolo_det_box']/m*100:7.0f}% "
              f"{agg['mp_given_box']/m*100:6.0f}% {agg['hybrid_pose']/m*100:6.0f}%")


if __name__ == "__main__":
    main()
