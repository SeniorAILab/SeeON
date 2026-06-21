"""Nursing-Home evaluation path — multi-person, deployment-equivalent inference.

CLI::

    python -m training.evaluate_nh --model-key <key> --pose-size {n,s,m} [--artifact-base P]

Loads a saved fall-classifier artifact, runs frame-by-frame YOLO pose
extraction + greedy-IoU multi-person tracking on every confirmed fall clip
found in ``nursing-home-gold.csv``, and reports missed falls + gate status.

Gate (``check_gate``) is a **pure function** (no YOLO / data dependencies)
that compares the caught-fall set against ``nh_reference_mask.json`` (frozen
in Phase 4.5).  A ``None`` mask arms the gate in permissive mode (always
passes) with a logged warning — supporting the pre-Phase-4.5 workflow.

Per-track npz cache
-------------------
YOLO inference is skipped on subsequent runs.  Cache files are named::

    {pose_size}/{video_stem}__track{track_id:04d}.npz

Each holds a dense ``float32[N_frames, 17, 3]`` ``poses`` array
(zeros where the tracker had no detection for that track on a given frame).

Lazy imports
------------
``cv2``, ``demo.*``, and ``training.extract_poses`` are imported inside
functions so that ``from training.evaluate_nh import check_gate`` works in
unit tests without loading YOLO weights (ADR-014 fail-fast; no silent skips
in production path).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final

import numpy as np

from training.config import (
    CONF_THRESHOLD,
    KPT_DIMS,
    KPT_VECTOR_DIM,
    N_KEYPOINTS,
    STRIDE,
    T_WINDOW,
)
from training.data.features import extract_window_features
from training.data.nursing_home import (
    NH_GOLD_CSV,
    NH_POSES_DIR,
    NH_PROCESSED_DIR,
    NHGoldRow,
    enumerate_processed_videos,
    parse_gold_csv,
)
from training.metadata import artifact_dir, load_metadata
from training.models import REGISTRY

POSE_SIZE_CHOICES: Final[tuple[str, ...]] = ("n", "s", "m")

log = logging.getLogger(__name__)

_ML_ROOT: Path = Path(__file__).resolve().parent.parent
_DEFAULT_MASK_PATH: Path = _ML_ROOT / "experiments" / "nh_reference_mask.json"
_DEFAULT_ARTIFACT_BASE: Path = _ML_ROOT / "artifacts" / "fall-detector"


# ---------------------------------------------------------------------------
# Gate — pure, testable without YOLO / data
# ---------------------------------------------------------------------------


def check_gate(
    model_key: str,
    caught_fall_ids: set[str],
    reference_mask: dict[str, list[str]] | None,
) -> tuple[bool, list[str]]:
    """Evaluate whether the model caught all gate-required falls.

    Parameters
    ----------
    model_key:
        Registry key for the model being evaluated.
    caught_fall_ids:
        Set of ``fall_id`` strings the model successfully detected.
    reference_mask:
        Parsed contents of ``nh_reference_mask.json``
        (schema: ``{model_key: [fall_id, ...]}``) or ``None`` when the file
        does not yet exist.  A ``None`` mask arms the gate in permissive mode:
        always passes with a warning logged.

    Returns
    -------
    tuple[bool, list[str]]
        ``(gate_passed, sorted_missed_fall_ids)``.
    """
    if reference_mask is None:
        log.warning("NH gate not armed (no reference mask) — check_gate returns pass")
        return (True, [])
    required = set(reference_mask.get(model_key, []))
    missed = sorted(required - caught_fall_ids)
    return (len(missed) == 0, missed)


# ---------------------------------------------------------------------------
# Overlap helper
# ---------------------------------------------------------------------------


def _window_overlaps_fall(
    start: int,
    fall_start_frame: int,
    fall_end_frame: int,
    window_size: int = T_WINDOW,
) -> bool:
    """Return True when window ``[start, start+window_size)`` overlaps the fall.

    Frame indices are 0-based inclusive; the fall occupies
    ``[fall_start_frame, fall_end_frame]`` inclusive (NH gold CSV convention).
    """
    overlap = max(
        0,
        min(start + window_size, fall_end_frame + 1) - max(start, fall_start_frame),
    )
    return overlap > 0


# ---------------------------------------------------------------------------
# Track inference
# ---------------------------------------------------------------------------


def _any_track_catches_fall(
    track_npz_paths: list[Path],
    fall_start_frame: int,
    fall_end_frame: int,
    clf: object,
    mode: str,
    threshold: float,
    window_size: int = T_WINDOW,
    stride: int = STRIDE,
) -> bool:
    """Return True if any tracked person's pose sequence triggers a fall prediction.

    Slides a window over each track's dense pose array and runs inference.
    Returns immediately on the first positive hit (no need to scan all tracks).

    Parameters
    ----------
    track_npz_paths:
        Per-track npz paths (``poses`` key: ``float32[N_frames, 17, 3]``).
    fall_start_frame / fall_end_frame:
        0-based inclusive fall interval from the gold CSV.
    clf:
        Loaded fall classifier (conforms to ``FallClassifier`` protocol).
    mode:
        ``"features"`` → flat feature vector (sklearn); ``"sequence"`` → raw
        window reshaped to ``[1, T, 51]`` (torch).
    threshold:
        Fall probability threshold (``meta.operating_threshold``).
    """
    for npz_path in track_npz_paths:
        data = np.load(str(npz_path))
        poses: np.ndarray = data["poses"]  # float32[N_frames, 17, 3]
        n_frames = len(poses)

        starts = (
            list(range(0, n_frames - window_size + 1, stride)) if n_frames >= window_size else [0]
        )

        for start in starts:
            if not _window_overlaps_fall(start, fall_start_frame, fall_end_frame, window_size):
                continue

            # Zero-padded window when clip is shorter than window_size
            window = np.zeros((window_size, N_KEYPOINTS, KPT_DIMS), dtype=np.float32)
            end = min(start + window_size, n_frames)
            window[: end - start] = poses[start:end]

            if mode == "features":
                x = extract_window_features(window)[np.newaxis]
            else:
                x = window.reshape(1, window_size, KPT_VECTOR_DIM)

            prob_fall = float(clf.predict_proba(x)[0, 1])  # type: ignore[union-attr]
            if prob_fall >= threshold:
                return True

    return False


# ---------------------------------------------------------------------------
# Per-video track-pose extraction (lazy cv2 / demo imports)
# ---------------------------------------------------------------------------


def _extract_track_poses(
    video_path: Path,
    poses_cache_dir: Path,
    video_stem: str,
    runner: object,
) -> list[Path]:
    """Extract per-track npz files from *video_path* using an existing *runner*.

    Dense ``float32[N_frames, 17, 3]`` arrays — zeros where a track was not
    detected on a given frame.

    Parameters
    ----------
    runner:
        Initialised ``YoloPoseRunner`` (passed in to keep the import lazy).

    Returns
    -------
    list[Path]
        Sorted list of created npz paths.

    Raises
    ------
    ValueError
        When the video cannot be opened or reports zero frames.
    """
    import cv2

    from contracts.observation import BoundingBox
    from training._tracking import GreedyIouTracker
    from training.extract_poses import normalize_person_keypoints

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if n_frames <= 0:
        cap.release()
        raise ValueError(f"Video reports 0 frames: {video_path}")

    tracker = GreedyIouTracker()
    # track_id → dense float32[n_frames, 17, 3]; zeros where not detected
    track_buffers: dict[int, np.ndarray] = {}

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        poses, raw_boxes = runner.predict_full(frame)  # type: ignore[union-attr]
        if raw_boxes:
            boxes = tuple(BoundingBox(x1, y1, x2, y2, conf) for x1, y1, x2, y2, conf in raw_boxes)
            track_ids = tracker.update(boxes)
            for person_idx, track_id in enumerate(track_ids):
                if track_id not in track_buffers:
                    track_buffers[track_id] = np.zeros(
                        (n_frames, N_KEYPOINTS, KPT_DIMS), dtype=np.float32
                    )
                person_pose = (poses[person_idx],)
                kpts = normalize_person_keypoints(person_pose, frame_w, frame_h, CONF_THRESHOLD)
                track_buffers[track_id][frame_idx] = kpts
        frame_idx += 1
    cap.release()

    if not track_buffers:
        # No person detected at all — store a single zero-filled track so the
        # caller can still slide windows and report a miss.
        log.warning(
            "No tracks detected in %s — single zero-filled track written",
            video_path.name,
        )
        track_buffers[0] = np.zeros((max(frame_idx, 1), N_KEYPOINTS, KPT_DIMS), dtype=np.float32)

    npz_paths: list[Path] = []
    for track_id, buffer in sorted(track_buffers.items()):
        npz_path = poses_cache_dir / f"{video_stem}__track{track_id:04d}.npz"
        np.savez_compressed(str(npz_path), poses=buffer)
        log.info("Saved track npz: %s  (%d frames)", npz_path.name, len(buffer))
        npz_paths.append(npz_path)

    return sorted(npz_paths)


def _pose_size_cache_dir(poses_cache_dir: Path, pose_size: str) -> Path:
    """Return the cache namespace for a supported pose size."""
    if pose_size not in POSE_SIZE_CHOICES:
        raise ValueError(
            f"Unsupported pose size {pose_size!r}; expected one of {POSE_SIZE_CHOICES}"
        )
    return poses_cache_dir / pose_size


def _sha256_file(path: Path) -> str:
    """Return the SHA256 hex digest for *path*."""
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolve_pose_weight(pose_size: str) -> tuple[Path, str, str]:
    """Resolve and hash the configured YOLO pose weight for *pose_size*."""
    from contracts.artifacts import pose_weight_filename, pose_weight_path

    if pose_size not in POSE_SIZE_CHOICES:
        raise ValueError(
            f"Unsupported pose size {pose_size!r}; expected one of {POSE_SIZE_CHOICES}"
        )
    weight_path = pose_weight_path(pose_size)
    if not weight_path.exists():
        raise FileNotFoundError(f"Pose weight for size {pose_size!r} not found at {weight_path}")
    return weight_path, pose_weight_filename(pose_size), _sha256_file(weight_path)


def _ensure_track_poses(
    video_path: Path,
    poses_cache_dir: Path,
    video_stem: str,
    pose_size: str,
    *,
    refresh_cache: bool = False,
) -> list[Path]:
    """Return per-track npz paths, running YOLO extraction if not cached.

    Cache hit: any ``{video_stem}__track*.npz`` glob match in the
    pose-size-specific cache directory.
    The YOLO runner is initialised lazily here (import stays out of module scope).

    Raises
    ------
    RuntimeError
        When YOLO weights cannot be initialised.
    """
    size_cache_dir = _pose_size_cache_dir(poses_cache_dir, pose_size)
    existing = sorted(size_cache_dir.glob(f"{video_stem}__track*.npz"))
    if existing and not refresh_cache:
        log.info(
            "Using %d cached track npz(s) for pose_size=%s video=%s in %s",
            len(existing),
            pose_size,
            video_stem,
            size_cache_dir,
        )
        return existing
    if existing and refresh_cache:
        for path in existing:
            path.unlink()
        log.info(
            "Refreshing %d cached track npz(s) for pose_size=%s video=%s",
            len(existing),
            pose_size,
            video_stem,
        )

    try:
        from runners.yolo_pose import YoloPoseRunner

        weight_path, _weight_filename, _weight_sha256 = _resolve_pose_weight(pose_size)
        runner = YoloPoseRunner(model_path=str(weight_path))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Cannot initialise YOLO runner for NH evaluation with pose_size={pose_size!r}: {exc}"
        ) from exc

    size_cache_dir.mkdir(parents=True, exist_ok=True)
    return _extract_track_poses(video_path, size_cache_dir, video_stem, runner)


# ---------------------------------------------------------------------------
# Main evaluation function
# ---------------------------------------------------------------------------


def evaluate_nh(
    model_key: str,
    artifact_base: Path,
    *,
    pose_size: str,
    gold_csv: Path = NH_GOLD_CSV,
    poses_cache_dir: Path = NH_POSES_DIR,
    processed_dir: Path = NH_PROCESSED_DIR,
    mask_path: Path = _DEFAULT_MASK_PATH,
    refresh_cache: bool = False,
    command_args: Sequence[str] | None = None,
) -> dict[str, object]:
    """Run deployment-equivalent multi-person NH evaluation for *model_key*."""
    if model_key not in REGISTRY:
        raise ValueError(f"Unknown model key {model_key!r}. Available: {sorted(REGISTRY.keys())}")

    out_dir = artifact_dir(model_key, artifact_base)
    model_file = out_dir / REGISTRY[model_key]["artifact_filename"]
    if not model_file.exists():
        raise FileNotFoundError(
            f"No artifact for {model_key!r} at {model_file}. Run train.py first."
        )

    _weight_path, weight_filename, weight_sha256 = _resolve_pose_weight(pose_size)
    size_cache_dir = _pose_size_cache_dir(poses_cache_dir, pose_size)

    clf = REGISTRY[model_key]["factory"].load(out_dir)
    meta = load_metadata(out_dir)
    mode: str = REGISTRY[model_key]["mode"]
    threshold: float = meta.operating_threshold
    win: int = meta.window
    stride: int = meta.stride

    confirmed_rows, proposed_rows = parse_gold_csv(gold_csv)
    if not confirmed_rows:
        raise ValueError(f"No confirmed rows found in {gold_csv}. Cannot evaluate.")
    if proposed_rows:
        log.warning(
            "%d proposed rows skipped (not yet confirmed) in %s",
            len(proposed_rows),
            gold_csv.name,
        )

    gold_by_id: dict[str, NHGoldRow] = {r.fall_id: r for r in confirmed_rows}

    video_paths = enumerate_processed_videos(processed_dir)
    if not video_paths:
        raise FileNotFoundError(f"No .mp4/.avi files found in {processed_dir}.")
    video_by_stem: dict[str, Path] = {v.stem: v for v in video_paths}

    caught_fall_ids: set[str] = set()
    cache_paths_by_clip: dict[str, list[str]] = {}
    missing_clips: list[dict[str, str]] = []
    failed_clips: list[dict[str, str]] = []
    clip_list: list[dict[str, str]] = []
    for fall_id, row in gold_by_id.items():
        video_path = video_by_stem.get(fall_id)
        if video_path is None:
            log.warning(
                "Video for fall_id %r not found in %s — reporting missing",
                fall_id,
                processed_dir,
            )
            missing_clips.append({"clip_id": fall_id, "reason": "processed video not found"})
            continue

        clip_list.append({"clip_id": fall_id, "path": str(video_path)})
        try:
            track_npz_paths = _ensure_track_poses(
                video_path,
                poses_cache_dir,
                fall_id,
                pose_size,
                refresh_cache=refresh_cache,
            )
            cache_paths_by_clip[fall_id] = [str(path) for path in track_npz_paths]
            caught = _any_track_catches_fall(
                track_npz_paths,
                row.fall_start_frame,
                row.fall_end_frame,
                clf,
                mode,
                threshold,
                window_size=win,
                stride=stride,
            )
        except Exception as exc:  # noqa: BLE001
            failed_clips.append({"clip_id": fall_id, "path": str(video_path), "error": str(exc)})
            log.exception("Failed evaluating clip %r with pose_size=%s", fall_id, pose_size)
            continue

        if caught:
            caught_fall_ids.add(fall_id)
        else:
            log.info("Miss: %r not caught by %r", fall_id, model_key)

    log.info(
        "[evaluate_nh] %r: caught %d/%d confirmed falls",
        model_key,
        len(caught_fall_ids),
        len(gold_by_id),
    )

    reference_mask: dict[str, list[str]] | None = None
    if mask_path.exists():
        try:
            reference_mask = json.loads(mask_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in reference mask {mask_path}: {exc}") from exc
    else:
        log.info(
            "NH reference mask not found at %s — delegating to check_gate",
            mask_path,
        )

    gate_passed, missed = check_gate(model_key, caught_fall_ids, reference_mask)
    denominator = len(gold_by_id)
    numerator = len(caught_fall_ids)
    detection_rate = (numerator / denominator) if denominator else 0.0
    return {
        "missed_fall_ids": missed,
        "gate_passed": gate_passed,
        "provenance": {
            "command_args": list(command_args) if command_args is not None else None,
            "pose_size": pose_size,
            "pose_weight_filename": weight_filename,
            "pose_weight_sha256": weight_sha256,
            "clip_list": clip_list,
            "processed_dir": str(processed_dir),
            "gold_csv": str(gold_csv),
            "cache_root": str(poses_cache_dir),
            "pose_size_cache_dir": str(size_cache_dir),
            "cache_paths": cache_paths_by_clip,
            "detection_rate": {
                "numerator": numerator,
                "denominator": denominator,
                "formula": "caught_confirmed_falls / confirmed_gold_falls",
                "value": detection_rate,
            },
            "missing_clips": missing_clips,
            "failed_clips": failed_clips,
            "model_artifact_key": model_key,
        },
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    """Build the NH evaluation CLI parser."""
    parser = argparse.ArgumentParser(
        description="Deployment-equivalent NH multi-person fall evaluation.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--model-key",
        required=True,
        choices=list(REGISTRY.keys()),
        help="Registry key of the model to evaluate.",
    )
    parser.add_argument(
        "--pose-size",
        required=True,
        choices=POSE_SIZE_CHOICES,
        help="YOLO26-pose size to evaluate.",
    )
    parser.add_argument(
        "--artifact-base",
        type=Path,
        default=_DEFAULT_ARTIFACT_BASE,
        help="Artifact root; model files live at <base>/<model-key>/.",
    )
    parser.add_argument(
        "--gold-csv",
        type=Path,
        default=NH_GOLD_CSV,
        help="Path to nursing-home-gold.csv.",
    )
    parser.add_argument(
        "--poses-cache-dir",
        type=Path,
        default=NH_POSES_DIR,
        help="Root directory for pose caches; size-specific subdirectories are used.",
    )
    parser.add_argument(
        "--processed-dir",
        type=Path,
        default=NH_PROCESSED_DIR,
        help="Directory containing processed NH evaluation videos.",
    )
    parser.add_argument(
        "--mask-path",
        type=Path,
        default=_DEFAULT_MASK_PATH,
        help="Path to nh_reference_mask.json (permissive gate when absent).",
    )
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Recompute pose caches for this pose size instead of reusing existing files.",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    """CLI entry point for NH multi-person evaluation.

    Example::

        uv run python -m training.evaluate_nh \
            --model-key random-forest \
            --pose-size n \
            --artifact-base artifacts/fall-detector
    """
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

    command_args = list(sys.argv[1:] if argv is None else argv)
    result = evaluate_nh(
        model_key=args.model_key,
        artifact_base=args.artifact_base,
        pose_size=args.pose_size,
        gold_csv=args.gold_csv,
        poses_cache_dir=args.poses_cache_dir,
        processed_dir=args.processed_dir,
        mask_path=args.mask_path,
        refresh_cache=args.refresh_cache,
        command_args=command_args,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
