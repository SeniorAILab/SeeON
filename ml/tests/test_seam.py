from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from demo.seam import (
    BoundingBox,
    DetectionLabel,
    DetectionResult,
    Frame,
    FrameSource,
    ModelModule,
    VideoFileSource,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_tiny_video(path: Path, frame_count: int = 6, fps: float = 6.0) -> Path:
    """Write a minimal uncompressed AVI so VideoCapture can read it reliably."""
    fourcc = cv2.VideoWriter_fourcc(*"MJPG")
    writer = cv2.VideoWriter(str(path), fourcc, fps, (32, 24))
    for i in range(frame_count):
        frame = np.full((24, 32, 3), i * 40, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return path


class _FakeModule:
    """Minimal ModelModule that returns a fixed DetectionResult."""

    def predict(self, frame: Frame) -> DetectionResult:
        box = BoundingBox(x1=0, y1=0, x2=10, y2=10, confidence=0.9)
        label = DetectionLabel(text="fall", confidence=0.9, is_fall=True)
        return DetectionResult(boxes=(box,), labels=(label,))


# ---------------------------------------------------------------------------
# FrameSource / VideoFileSource tests
# ---------------------------------------------------------------------------

def test_video_file_source_yields_frame_objects(tmp_path: Path) -> None:
    video_path = _write_tiny_video(tmp_path / "tiny.avi", frame_count=6, fps=6.0)

    frames = list(VideoFileSource(video_path))

    assert len(frames) == 6
    assert all(isinstance(f, Frame) for f in frames)
    assert frames[0].index == 0
    assert frames[-1].index == 5


def test_video_file_source_images_are_rgb_hwc(tmp_path: Path) -> None:
    video_path = _write_tiny_video(tmp_path / "tiny.avi", frame_count=3)

    frames = list(VideoFileSource(video_path))

    for frame in frames:
        assert frame.image.ndim == 3
        assert frame.image.shape[2] == 3
        assert frame.image.dtype == np.uint8


def test_video_file_source_respects_frame_stride(tmp_path: Path) -> None:
    video_path = _write_tiny_video(tmp_path / "tiny.avi", frame_count=6, fps=6.0)

    frames = list(VideoFileSource(video_path, frame_stride=2))

    # stride=2: frames at raw indices 0,2,4 → 3 logical frames
    assert len(frames) == 3
    assert frames[0].index == 0
    assert frames[1].index == 1
    assert frames[2].index == 2


def test_video_file_source_time_sec_is_non_negative(tmp_path: Path) -> None:
    video_path = _write_tiny_video(tmp_path / "tiny.avi", frame_count=4, fps=4.0)

    frames = list(VideoFileSource(video_path))

    assert all(f.time_sec >= 0.0 for f in frames)


def test_video_file_source_is_frame_source_protocol(tmp_path: Path) -> None:
    video_path = _write_tiny_video(tmp_path / "tiny.avi", frame_count=2)
    source = VideoFileSource(video_path)

    assert isinstance(source, FrameSource)


# ---------------------------------------------------------------------------
# ModelModule / DetectionResult tests
# ---------------------------------------------------------------------------

def test_detection_result_empty_defaults() -> None:
    result = DetectionResult()

    assert result.boxes == ()
    assert result.labels == ()
    assert result.keypoints == ()


def test_detection_result_boxes_and_labels_populated() -> None:
    box = BoundingBox(x1=10, y1=20, x2=50, y2=80, confidence=0.75)
    label = DetectionLabel(text="fall", confidence=0.75, is_fall=True)
    result = DetectionResult(boxes=(box,), labels=(label,))

    assert len(result.boxes) == 1
    assert result.boxes[0].confidence == 0.75
    assert result.labels[0].is_fall is True


def test_fake_module_satisfies_model_module_protocol() -> None:
    module = _FakeModule()
    frame = Frame(
        index=0,
        time_sec=0.0,
        image=np.zeros((24, 32, 3), dtype=np.uint8),
    )

    assert isinstance(module, ModelModule)
    result = module.predict(frame)

    assert isinstance(result, DetectionResult)
    assert len(result.boxes) == 1
    assert result.boxes[0].x2 == 10
    assert result.labels[0].text == "fall"
    assert result.labels[0].is_fall is True


def test_fake_module_over_video_file_source_yields_results(tmp_path: Path) -> None:
    video_path = _write_tiny_video(tmp_path / "tiny.avi", frame_count=4)
    module = _FakeModule()

    results = [module.predict(frame) for frame in VideoFileSource(video_path)]

    assert len(results) == 4
    assert all(isinstance(r, DetectionResult) for r in results)
    assert all(len(r.boxes) == 1 for r in results)
