from __future__ import annotations

import numpy as np

from sources.rtsp import RTSPSource


class _FakeCapture:
    instances: list[_FakeCapture] = []

    def __init__(self, url: str) -> None:
        self.url = url
        self.released = False
        self.set_calls: list[tuple[int, int]] = []
        self._frames = [
            np.array([[[10, 20, 30]]], dtype=np.uint8),
            np.array([[[40, 50, 60]]], dtype=np.uint8),
        ]

    def set(self, prop: int, value: int) -> None:
        self.set_calls.append((prop, value))

    def read(self) -> tuple[bool, np.ndarray | None]:
        if self._frames:
            return True, self._frames.pop(0)
        return False, None

    def release(self) -> None:
        self.released = True


def _capture_factory(url: str) -> _FakeCapture:
    capture = _FakeCapture(url)
    _FakeCapture.instances.append(capture)
    return capture


def test_rtsp_source_yields_rgb_frames_and_releases_capture(monkeypatch) -> None:
    import sources.rtsp as rtsp

    _FakeCapture.instances = []
    monkeypatch.setattr(rtsp.cv2, "VideoCapture", _capture_factory)
    monkeypatch.setattr(rtsp.time, "monotonic", _monotonic_values((10.0, 10.25)))

    frames = list(RTSPSource("rtsp://camera/trackID=2", max_failures=1))

    assert [frame.index for frame in frames] == [0, 1]
    assert [frame.time_sec for frame in frames] == [0.0, 0.25]
    assert frames[0].image.tolist() == [[[30, 20, 10]]]
    assert frames[1].image.tolist() == [[[60, 50, 40]]]
    assert _FakeCapture.instances[0].url == "rtsp://camera/trackID=2"
    assert (rtsp.cv2.CAP_PROP_BUFFERSIZE, 1) in _FakeCapture.instances[0].set_calls
    assert _FakeCapture.instances[0].released is True


def _monotonic_values(values: tuple[float, ...]):
    iterator = iter(values)

    def next_value() -> float:
        return next(iterator)

    return next_value
