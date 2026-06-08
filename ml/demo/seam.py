from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable

import numpy as np
from numpy.typing import NDArray


@dataclass(frozen=True, slots=True)
class BoundingBox:
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float


@dataclass(frozen=True, slots=True)
class DetectionLabel:
    text: str
    confidence: float
    is_fall: bool


@dataclass(frozen=True, slots=True)
class DetectionResult:
    boxes: tuple[BoundingBox, ...] = field(default_factory=tuple)
    labels: tuple[DetectionLabel, ...] = field(default_factory=tuple)
    # per-person COCO-17 keypoints; each kpt = (x:int, y:int, conf:float)
    # mirrors existing PoseDetections TypeAlias in yolo_runtime.py
    keypoints: tuple[tuple[tuple[int, int, float], ...], ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class Frame:
    index: int
    time_sec: float
    image: NDArray[np.uint8]


@runtime_checkable
class FrameSource(Protocol):
    def __iter__(self) -> Iterator[Frame]: ...


class VideoFileSource:
    def __init__(
        self,
        source: str | Path,
        start_sec: float = 0.0,
        frame_stride: int = 1,
    ) -> None:
        self._source = str(source)
        self._start_sec = start_sec
        self._frame_stride = max(1, frame_stride)

    def __iter__(self) -> Iterator[Frame]:
        # Thin adapter: delegate the cap.read() loop to iter_playback_frames so
        # there is exactly one frame-reading implementation in the codebase.
        try:
            from demo.video_playback import iter_playback_frames
        except ModuleNotFoundError:
            from video_playback import iter_playback_frames  # type: ignore[no-redef]

        for idx, t, image in iter_playback_frames(
            path=Path(self._source),
            start_sec=self._start_sec,
            frame_stride=self._frame_stride,
        ):
            yield Frame(index=idx, time_sec=t, image=image)


@runtime_checkable
class ModelModule(Protocol):
    def predict(self, frame: Frame) -> DetectionResult: ...
