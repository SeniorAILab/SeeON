"""Pose extraction pipeline — Step 1 of the Le2i temporal fall-classifier.

CLI::

    python -m training.extract_poses --input-dir <le2i_root> [--output-dir P] [--smoke-n N]

Assumed Le2i directory layout::

    <input_dir>/
        Coffee_room/
            video (1).avi
            video (2).avi
            ...
            Annotation_files/       # optional subfolder; may also sit alongside .avi
                video (1).txt
                video (2).txt
                ...
        Home/
            video (1).avi
            ...
            Annotation_files/
                ...
        Office/  ...
        Lecture_room/  ...

``discover_clips()`` is intentionally isolated — edit only that function to adapt
to a different layout (e.g. flat structure, different annotation placement).

The annotation .txt files are NOT parsed here; that is the data-loader's job.
This module only produces keypoints + fps + clip_id + scenario.
"""

from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from contracts.artifacts import pose_weight_path
from features.pose_normalization import normalize_person_keypoints
from runners.yolo_pose import YoloPoseRunner
from training import config

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ClipRef:
    """Lightweight descriptor for one Le2i video clip."""

    scenario: str
    video_path: Path

    @property
    def clip_id(self) -> str:
        """Stable string key — e.g. ``Coffee_room/video (1)``."""
        return f"{self.scenario}/{self.video_path.stem}"


# ---------------------------------------------------------------------------
# Directory walk
# ---------------------------------------------------------------------------


def discover_clips(input_dir: Path) -> list[ClipRef]:
    """Walk a Le2i directory tree and return a sorted list of ClipRef objects.

    Assumed layout::

        <input_dir>/
            {scenario}/          # one of config.LE2I_SCENARIOS
                *.avi | *.mp4    # one file per clip
                Annotation_files/
                    *.txt        # annotation per video (parsed by the data loader, not here)

    Only folders whose names appear in ``config.LE2I_SCENARIOS`` are entered.
    Clips are sorted by (scenario, video stem) for deterministic ordering.

    To adapt to a different layout (e.g. flat structure, different extension)
    edit only this function.
    """
    # === 단계 1: 영상 클립 탐색 — 시나리오 디렉터리 순회 및 .avi/.mp4 클립 수집 ===
    clips: list[ClipRef] = []
    scenario_set = set(config.LE2I_SCENARIOS)

    for scenario_dir in sorted(input_dir.iterdir()):
        if not scenario_dir.is_dir() or scenario_dir.name not in scenario_set:
            continue
        scenario = scenario_dir.name
        video_paths = sorted(scenario_dir.glob("*.avi")) + sorted(scenario_dir.glob("*.mp4"))
        for video_path in video_paths:
            clips.append(ClipRef(scenario=scenario, video_path=video_path))

    return clips


# Pure keypoint normalisation lives in features.pose_normalization.


# ---------------------------------------------------------------------------
# Per-clip extraction
# ---------------------------------------------------------------------------


def _npz_stem(clip: ClipRef) -> str:
    """Flat filename stem for the .npz — replaces path separator with '__'."""
    return clip.clip_id.replace("/", "__")


def _extract_clip(clip: ClipRef, output_dir: Path, runner: YoloPoseRunner) -> None:
    """Run YOLO pose inference on every frame of *clip* and save a .npz file.

    Saved arrays:
    - ``keypoints``:  float32[N_frames, 17, 3]
    - ``clip_id``:    bytes (UTF-8 encoded string, e.g. b"Coffee_room/video (1)")
    - ``scenario``:   bytes (UTF-8 encoded string, e.g. b"Coffee_room")
    - ``fps``:        float32 scalar (read from video header; falls back to config.LE2I_FPS)
    """
    cap = cv2.VideoCapture(str(clip.video_path))
    if not cap.isOpened():
        log.error("Cannot open video: %s", clip.video_path)
        return

    raw_fps = cap.get(cv2.CAP_PROP_FPS)
    fps: float = raw_fps if raw_fps and raw_fps > 0 else config.LE2I_FPS

    # === 단계 2: 프레임별 YOLO 포즈 추론 및 키포인트 정규화 ===
    all_keypoints: list[NDArray[np.float32]] = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_h, frame_w = frame.shape[:2]
        pose_detections, _boxes = runner.predict_full(frame)
        kpts = normalize_person_keypoints(
            pose_detections,
            frame_w,
            frame_h,
            config.CONF_THRESHOLD,
        )
        all_keypoints.append(kpts)

    cap.release()

    if not all_keypoints:
        log.warning("No frames extracted from %s — skipping save", clip.video_path)
        return

    # === 단계 4: 키포인트 배열 스택 및 npz 캐시 저장 ===
    keypoints_arr = np.stack(all_keypoints, axis=0).astype(np.float32)
    out_path = output_dir / f"{_npz_stem(clip)}.npz"
    np.savez(
        out_path,
        keypoints=keypoints_arr,
        clip_id=np.bytes_(clip.clip_id.encode()),
        scenario=np.bytes_(clip.scenario.encode()),
        fps=np.float32(fps),
    )
    log.info(
        "Saved %s  (%d frames, fps=%.1f)",
        out_path.name,
        len(all_keypoints),
        fps,
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    """Parse arguments and run the extraction loop."""
    parser = argparse.ArgumentParser(
        description=("Extract COCO-17 pose keypoints from Le2i .avi/.mp4 clips into .npz caches.")
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=config.RAW_DATA_DIR,
        help=(
            "Le2i dataset root directory (contains Coffee_room/, Home/, etc.; "
            f"default: {config.RAW_DATA_DIR})."
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=config.POSE_CACHE_DIR,
        help=f"Directory for output .npz files (default: {config.POSE_CACHE_DIR}).",
    )
    parser.add_argument(
        "--smoke-n",
        type=int,
        default=None,
        metavar="N",
        help="Process only the first N discovered clips (sorted order).",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    output_dir: Path = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    log.info("Discovering clips in %s", args.input_dir)
    clips = discover_clips(args.input_dir)
    log.info("Found %d total clips", len(clips))

    if args.smoke_n is not None:
        clips = clips[: args.smoke_n]
        log.info("Smoke mode: processing first %d clips", len(clips))

    # Instantiate the runner here — not at module level — so the module is
    # importable (and unit-testable) without loading YOLO weights.
    runner = YoloPoseRunner(model_path=str(pose_weight_path("n")))

    skipped = 0
    extracted = 0
    for clip in clips:
        out_path = output_dir / f"{_npz_stem(clip)}.npz"
        if out_path.exists():
            log.debug("Skip (exists): %s", clip.clip_id)
            skipped += 1
            continue
        log.info("Extracting: %s", clip.clip_id)
        _extract_clip(clip, output_dir, runner)
        extracted += 1

    log.info("Done.  extracted=%d  skipped=%d", extracted, skipped)


if __name__ == "__main__":
    main()
