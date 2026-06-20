from __future__ import annotations

import json
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import numpy as np

from core.contract import BoundingBox, DetectionLabel, Frame, FrameObservation
from demo.live_bench import measure_pipeline

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeSource:
    """Yields ``count`` synthetic frames; satisfies the FrameSource protocol."""

    def __init__(self, count: int) -> None:
        self._count = count

    def __iter__(self) -> Iterator[Frame]:
        for i in range(self._count):
            image = np.zeros((16, 24, 3), dtype=np.uint8)
            yield Frame(index=i, time_sec=round(i * 0.1, 3), image=image)


class _FakeModel:
    """Returns a minimal FrameObservation for every frame; no real inference."""

    def predict(self, frame: Frame) -> FrameObservation:
        box = BoundingBox(x1=0, y1=0, x2=8, y2=8, confidence=0.5)
        label = DetectionLabel(text="person", confidence=0.5, is_fall=False)
        return FrameObservation(detections=((box,), (label,)), poses=(), regions=((), ()))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_measure_pipeline_returns_correct_frame_count() -> None:
    metrics = measure_pipeline(_FakeSource(10), _FakeModel())

    assert metrics["frames"] == 10


def test_measure_pipeline_returns_positive_fps() -> None:
    metrics = measure_pipeline(_FakeSource(5), _FakeModel())

    assert metrics["fps"] > 0.0


def test_measure_pipeline_returns_non_negative_latency() -> None:
    metrics = measure_pipeline(_FakeSource(5), _FakeModel())

    assert metrics["latency_ms"] >= 0.0


def test_measure_pipeline_returns_required_keys() -> None:
    metrics = measure_pipeline(_FakeSource(3), _FakeModel())

    assert set(metrics.keys()) == {"fps", "latency_ms", "frames"}


def test_measure_pipeline_fps_and_latency_are_floats() -> None:
    metrics = measure_pipeline(_FakeSource(4), _FakeModel())

    assert isinstance(metrics["fps"], float)
    assert isinstance(metrics["latency_ms"], float)


def test_measure_pipeline_frames_is_int() -> None:
    metrics = measure_pipeline(_FakeSource(4), _FakeModel())

    assert isinstance(metrics["frames"], int)


def test_measure_pipeline_empty_source_returns_zero_frames() -> None:
    metrics = measure_pipeline(_FakeSource(0), _FakeModel())

    assert metrics["frames"] == 0
    assert metrics["fps"] == 0.0
    assert metrics["latency_ms"] == 0.0


def test_measure_pipeline_latency_rounded_to_two_dp() -> None:
    metrics = measure_pipeline(_FakeSource(6), _FakeModel())

    # round() to 2dp means at most 2 decimal places
    lat = metrics["latency_ms"]
    assert round(lat, 2) == lat


def test_measure_pipeline_fps_rounded_to_two_dp() -> None:
    metrics = measure_pipeline(_FakeSource(6), _FakeModel())

    fps = metrics["fps"]
    assert round(fps, 2) == fps


def test_live_bench_main_outputs_json_line(tmp_path: Path) -> None:
    """Integration smoke: run live_bench as a subprocess and check JSON output."""
    # Write a tiny synthetic video so the real VideoFileSource works.
    import cv2

    video_path = tmp_path / "tiny.avi"
    fourcc = cv2.VideoWriter_fourcc(*"MJPG")
    writer = cv2.VideoWriter(str(video_path), fourcc, 30.0, (32, 24))
    for i in range(30):
        frame = np.full((24, 32, 3), i * 8, dtype=np.uint8)
        writer.write(frame)
    writer.release()

    ml_root = str(Path(__file__).resolve().parent.parent)
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "demo.live_bench",
            "--json",
            "--video",
            str(video_path),
            "--limit",
            "20",
        ],
        capture_output=True,
        text=True,
        cwd=ml_root,
    )

    assert result.returncode == 0, f"live_bench failed:\n{result.stderr}"
    # Last non-empty line of stdout must be valid JSON with the required keys.
    lines = [ln for ln in result.stdout.splitlines() if ln.strip()]
    assert lines, "Expected at least one output line"
    data = json.loads(lines[-1])
    assert set(data.keys()) == {"fps", "latency_ms", "frames"}
    assert data["frames"] == 20
