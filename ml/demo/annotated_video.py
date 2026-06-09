from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import cv2
import numpy as np
from numpy.typing import NDArray

import demo.pretrained as weights
from demo.model_modules import YoloDetectionModule, YoloPoseModule
from demo.model_registry import ModelSpec
from demo.playback_status import current_playback_status
from demo.seam import DetectionResult, Frame
from demo.video_registry import DATA_DIR
from demo.yolo_overlay import render_yolo_overlay

ANNOTATED_VIDEO_DIR: Final = DATA_DIR / "annotated"
OUTPUT_CODEC: Final = "avc1"
OUTPUT_ENCODING_VERSION: Final = "avc1-v1"
TEXT_ORIGIN: Final = (24, 42)
TEXT_SCALE: Final = 1.2
TEXT_THICKNESS: Final = 3

ProgressCallback = Callable[[float], None]


@dataclass(frozen=True, slots=True)
class AnnotatedVideoResult:
    path: Path
    frames_written: int


def annotated_video_path(
    source_path: Path,
    spec: ModelSpec,
    threshold: float,
    frame_stride: int,
    output_dir: Path = ANNOTATED_VIDEO_DIR,
) -> Path:
    stat = source_path.stat()
    cache_basis = "|".join(
        (
            str(source_path.resolve()),
            str(stat.st_size),
            str(stat.st_mtime_ns),
            spec.model_id,
            f"{threshold:.4f}",
            str(frame_stride),
            OUTPUT_ENCODING_VERSION,
        )
    )
    digest = hashlib.sha256(cache_basis.encode("utf-8")).hexdigest()[:16]
    return output_dir / f"{source_path.stem}-{spec.model_id}-{digest}.mp4"


def build_annotated_video(
    source_path: Path,
    spec: ModelSpec,
    threshold: float,
    frame_stride: int,
    progress_callback: ProgressCallback | None = None,
    output_dir: Path = ANNOTATED_VIDEO_DIR,
) -> AnnotatedVideoResult:
    output_dir.mkdir(parents=True, exist_ok=True)
    target = annotated_video_path(
        source_path=source_path,
        spec=spec,
        threshold=threshold,
        frame_stride=frame_stride,
        output_dir=output_dir,
    )
    if target.exists():
        return AnnotatedVideoResult(path=target, frames_written=0)

    weights.materialize_pretrained_artifact(spec)
    detection_module = YoloDetectionModule(spec=spec, threshold=threshold)
    pose_module = YoloPoseModule()
    return _write_annotated_video(
        source_path=source_path,
        target=target,
        detection_module=detection_module,
        pose_module=pose_module,
        frame_stride=max(frame_stride, 1),
        progress_callback=progress_callback,
    )


def _write_annotated_video(
    source_path: Path,
    target: Path,
    detection_module: YoloDetectionModule,
    pose_module: YoloPoseModule,
    frame_stride: int,
    progress_callback: ProgressCallback | None,
) -> AnnotatedVideoResult:
    capture = cv2.VideoCapture(str(source_path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 12.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        if width <= 0 or height <= 0:
            raise OSError(f"Could not create annotated video: {source_path}")

        temp_target = target.with_name(f"{target.stem}.part.mp4")
        writer = cv2.VideoWriter(
            str(temp_target),
            cv2.VideoWriter_fourcc(*OUTPUT_CODEC),
            max(fps / frame_stride, 1.0),
            (width, height),
        )
        if not writer.isOpened():
            raise OSError(f"Could not create annotated video: {target}")

        try:
            frames_written = _write_sampled_frames(
                capture=capture,
                writer=writer,
                detection_module=detection_module,
                pose_module=pose_module,
                frame_stride=frame_stride,
                total_frames=frame_count,
                progress_callback=progress_callback,
            )
        finally:
            writer.release()
        temp_target.replace(target)
        return AnnotatedVideoResult(path=target, frames_written=frames_written)
    finally:
        capture.release()


def _write_sampled_frames(
    capture,
    writer,
    detection_module: YoloDetectionModule,
    pose_module: YoloPoseModule,
    frame_stride: int,
    total_frames: int,
    progress_callback: ProgressCallback | None,
) -> int:
    raw_index = 0
    frame_index = 0
    sampled_total = max(total_frames // frame_stride, 1)
    while True:
        read_ok, frame_bgr = capture.read()
        if not read_ok:
            break
        if raw_index % frame_stride == 0:
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            time_sec = raw_index / max(float(capture.get(cv2.CAP_PROP_FPS) or 12.0), 1.0)
            frame_obj = Frame(index=frame_index, time_sec=time_sec, image=frame_rgb)
            det_result = detection_module.predict(frame_obj)
            pose_result = pose_module.predict(frame_obj)
            combined = DetectionResult(
                boxes=det_result.boxes,
                labels=det_result.labels,
                keypoints=pose_result.keypoints,
            )
            overlay = render_yolo_overlay(frame=frame_rgb, result=combined)
            status = current_playback_status(
                result=det_result,
                pose_count=_visible_pose_count(pose_result.keypoints),
                time_sec=time_sec,
            )
            _draw_status_text(frame=overlay, label="FALL" if status.is_fall else "NORMAL")
            writer.write(cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))
            frame_index += 1
            if progress_callback is not None:
                progress_callback(min(frame_index / sampled_total, 1.0))
        raw_index += 1
    return frame_index


def _visible_pose_count(keypoints: tuple[tuple[tuple[int, int, float], ...], ...]) -> int:
    return sum(1 for pose in keypoints if any(confidence >= 0.2 for _x, _y, confidence in pose))


def _draw_status_text(frame: NDArray[np.uint8], label: str) -> None:
    color = (255, 80, 80) if label == "FALL" else (80, 220, 120)
    cv2.putText(
        frame,
        label,
        TEXT_ORIGIN,
        cv2.FONT_HERSHEY_SIMPLEX,
        TEXT_SCALE,
        color,
        TEXT_THICKNESS,
        cv2.LINE_AA,
    )
