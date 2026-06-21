"""Serving-safe FrameSource → pose → RF pipeline."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

from contracts import BoundingBox, DetectionLabel, FrameObservation, FrameSource, ModelModule
from contracts.artifacts import WEIGHTS_DIR, pose_weight_path
from contracts.model import DEFAULT_FALL_CONFIDENCE_THRESHOLD
from runners.yolo_pose import YoloPoseRunner
from serving.model import FallDetector
from sources import VideoFileSource

DEFAULT_POSE_SIZE = "n"
DEFAULT_MAX_FRAMES = 120
MAX_MAX_FRAMES = 300
DEFAULT_DURATION_SEC = 5.0
MAX_DURATION_SEC = 30.0
DEFAULT_FRAME_STRIDE = 1
MAX_FRAME_STRIDE = 30
DEFAULT_TIMEOUT_SEC = 10.0
MAX_TIMEOUT_SEC = 60.0


class YoloPoseModule:
    def __init__(self, size: str = "n", confidence: float = 0.05) -> None:
        WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
        self._runner = YoloPoseRunner(model_path=str(pose_weight_path(size)), confidence=confidence)

    def predict(self, frame) -> FrameObservation:
        poses, raw_boxes = self._runner.predict_full(frame.image)
        boxes = tuple(
            BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=conf)
            for x1, y1, x2, y2, conf in raw_boxes
        )
        labels = tuple(
            DetectionLabel(text="person", confidence=conf, is_fall=False)
            for _x1, _y1, _x2, _y2, conf in raw_boxes
        )
        return FrameObservation(detections=(boxes, labels), poses=poses)


class PipelineError(RuntimeError):
    pass


class PipelineTimeoutError(PipelineError):
    pass


class PoseFactory(Protocol):
    def __call__(self) -> ModelModule: ...


@dataclass(frozen=True, slots=True)
class PipelineControls:
    start_sec: float = 0.0
    duration_sec: float = DEFAULT_DURATION_SEC
    frame_stride: int = DEFAULT_FRAME_STRIDE
    max_frames: int = DEFAULT_MAX_FRAMES
    timeout_sec: float = DEFAULT_TIMEOUT_SEC

    def validate(self, source_duration_sec: float) -> None:
        if self.start_sec < 0:
            raise PipelineError("start_sec must be non-negative")
        if self.duration_sec <= 0 or self.duration_sec > MAX_DURATION_SEC:
            raise PipelineError(f"duration_sec must be > 0 and <= {MAX_DURATION_SEC}")
        if self.start_sec + self.duration_sec > source_duration_sec:
            raise PipelineError("requested window exceeds source duration metadata")
        if self.frame_stride < 1 or self.frame_stride > MAX_FRAME_STRIDE:
            raise PipelineError(f"frame_stride must be between 1 and {MAX_FRAME_STRIDE}")
        if self.max_frames < 1 or self.max_frames > MAX_MAX_FRAMES:
            raise PipelineError(f"max_frames must be between 1 and {MAX_MAX_FRAMES}")
        if self.timeout_sec <= 0 or self.timeout_sec > MAX_TIMEOUT_SEC:
            raise PipelineError(f"timeout_sec must be > 0 and <= {MAX_TIMEOUT_SEC}")


def pose_weight_available(size: str = DEFAULT_POSE_SIZE) -> bool:
    return pose_weight_path(size).exists()


class FallPipeline:
    def __init__(
        self,
        model: FallDetector,
        pose_factory: PoseFactory | None = None,
        pose_size: str = DEFAULT_POSE_SIZE,
    ) -> None:
        self._model = model
        self.pose_size = pose_size
        self._pose_factory = pose_factory or (lambda: YoloPoseModule(size=pose_size))

    def predict_path(
        self, path: Path, controls: PipelineControls, source_duration_sec: float
    ) -> float:
        controls.validate(source_duration_sec)
        source = VideoFileSource(
            path, start_sec=controls.start_sec, frame_stride=controls.frame_stride
        )
        return self.predict_source(source, controls)

    def predict_source(self, source: FrameSource, controls: PipelineControls) -> float:
        pose = self._pose_factory()
        window: list[np.ndarray] = []
        frames_seen = 0
        deadline = time.monotonic() + controls.timeout_sec
        for frame in source:
            if time.monotonic() > deadline:
                raise PipelineTimeoutError("prediction timed out")
            if frames_seen >= controls.max_frames:
                raise PipelineError("frame budget exceeded")
            if frame.time_sec >= controls.start_sec + controls.duration_sec:
                break
            result = pose.predict(frame)
            normalised = normalize_primary_person(
                result, frame.image.shape[1], frame.image.shape[0]
            )
            if normalised is not None:
                window.append(normalised)
            frames_seen += 1
            if len(window) >= self._model.metadata.window:
                features = window_to_features(window[-self._model.metadata.window :])
                return self._model.predict(features)
        if not window:
            raise PipelineError("no person detected in requested source window")
        raise PipelineError(
            "insufficient person keypoint window: "
            f"got {len(window)}, need {self._model.metadata.window}"
        )


def normalize_primary_person(
    result: FrameObservation, frame_w: int, frame_h: int
) -> np.ndarray | None:
    if not result.boxes or not result.keypoints:
        return None
    best_idx = max(range(len(result.boxes)), key=lambda idx: _box_area(result.boxes[idx]))
    if best_idx >= len(result.keypoints):
        return None
    from features.pose_normalization import normalize_person_keypoints

    arr = normalize_person_keypoints(
        (result.keypoints[best_idx],), frame_w, frame_h, DEFAULT_FALL_CONFIDENCE_THRESHOLD
    )
    if not np.asarray(arr).any():
        return None
    return np.asarray(arr, dtype=np.float32)


def window_to_features(window: list[np.ndarray]) -> np.ndarray:
    from features.window_features import extract_window_features

    arr = np.asarray(window, dtype=np.float32)
    return np.asarray(extract_window_features(arr), dtype=np.float32)


def _box_area(box: object) -> int:
    return max(0, int(box.x2) - int(box.x1)) * max(0, int(box.y2) - int(box.y1))
