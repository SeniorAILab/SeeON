from __future__ import annotations

import cv2
import numpy as np
from numpy.typing import NDArray

from sources.rtsp import RTSPSource
from sources.rtsp_backend import OpenCVRTSPBackend


class _FakeCapture:
    def __init__(self) -> None:
        self._frames = [
            np.array([[[10, 20, 30]]], dtype=np.uint8),
            np.array([[[40, 50, 60]]], dtype=np.uint8),
        ]
        self.set_calls: list[tuple[int, float]] = []
        self.released = False

    def set(self, prop_id: int, value: float) -> bool:
        self.set_calls.append((prop_id, value))
        return True

    def read(self) -> tuple[bool, NDArray[np.uint8] | None]:
        if self._frames:
            return True, self._frames.pop(0)
        return False, None

    def release(self) -> None:
        self.released = True


class _RecordingBackend:
    def __init__(self) -> None:
        self.capture = _FakeCapture()
        self.open_calls: list[tuple[str, int, int]] = []
        self.release_calls = 0

    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> _FakeCapture:
        self.open_calls.append((url, open_timeout_ms, read_timeout_ms))
        return self.capture

    def read(self, capture: _FakeCapture) -> tuple[bool, NDArray[np.uint8] | None]:
        return capture.read()

    def release(self, capture: _FakeCapture) -> None:
        self.release_calls += 1
        capture.release()


def test_rtsp_source_forwards_url_timeouts_and_releases_backend(monkeypatch) -> None:
    import sources.rtsp as rtsp

    backend = _RecordingBackend()
    monkeypatch.setattr(rtsp, "_create_backend", lambda: backend)
    monkeypatch.setattr(rtsp.time, "monotonic", _monotonic_values((10.0, 10.25)))

    frames = list(
        RTSPSource(
            "rtsp://camera/trackID=2",
            max_failures=1,
            open_timeout_ms=1234,
            read_timeout_ms=5678,
        )
    )

    assert backend.open_calls == [("rtsp://camera/trackID=2", 1234, 5678)]
    assert backend.release_calls == 1
    assert backend.capture.released is True
    assert [frame.index for frame in frames] == [0, 1]
    assert [frame.time_sec for frame in frames] == [0.0, 0.25]
    assert frames[0].image.tolist() == [[[30, 20, 10]]]
    assert frames[1].image.tolist() == [[[60, 50, 40]]]


def test_opencv_rtsp_backend_sets_timeout_and_buffer_properties(monkeypatch) -> None:
    captures: list[_FakeCapture] = []
    calls: list[tuple[str, tuple[object, ...]]] = []

    def video_capture(url: str, *args: object) -> _FakeCapture:
        calls.append((url, args))
        capture = _FakeCapture()
        captures.append(capture)
        return capture

    monkeypatch.setattr(cv2, "VideoCapture", video_capture)

    capture = OpenCVRTSPBackend().open("rtsp://camera/trackID=2", 1234, 5678)

    assert capture is captures[0]
    assert calls == [
        (
            "rtsp://camera/trackID=2",
            (
                cv2.CAP_FFMPEG,
                [
                    cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                    1234,
                    cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                    5678,
                ],
            ),
        )
    ]
    assert (cv2.CAP_PROP_BUFFERSIZE, 1) in capture.set_calls
    assert (cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5678) in capture.set_calls


def test_opencv_rtsp_backend_releases_capture() -> None:
    capture = _FakeCapture()

    OpenCVRTSPBackend().release(capture)

    assert capture.released is True


def test_opencv_rtsp_backend_falls_back_when_parameterized_open_fails(
    monkeypatch,
) -> None:
    calls: list[tuple[str, tuple[object, ...]]] = []

    def video_capture(url: str, *args: object) -> _FakeCapture:
        calls.append((url, args))
        if len(calls) == 1:
            raise TypeError("three-argument VideoCapture not supported")
        return _FakeCapture()

    monkeypatch.setattr(cv2, "VideoCapture", video_capture)

    OpenCVRTSPBackend().open("rtsp://camera/trackID=2", 1234, 5678)

    assert calls == [
        (
            "rtsp://camera/trackID=2",
            (
                cv2.CAP_FFMPEG,
                [
                    cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                    1234,
                    cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                    5678,
                ],
            ),
        ),
        ("rtsp://camera/trackID=2", (cv2.CAP_FFMPEG,)),
    ]


def _monotonic_values(values: tuple[float, ...]):
    iterator = iter(values)

    def next_value() -> float:
        return next(iterator)

    return next_value
