from __future__ import annotations

import os

import cv2
import numpy as np
import pytest
from numpy.typing import NDArray

from worker.sources.probe import RTSPProbeError, mask_rtsp_url, probe_first_frame
from worker.sources.rtsp import RTSPSource, _create_backend, create_backend
from worker.sources.rtsp_backend import (
    FallbackRTSPBackend,
    NvdecRTSPBackend,
    OpenCVRTSPBackend,
)


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


class _ProbeCapture:
    def __init__(
        self,
        responses: list[tuple[bool, NDArray[np.uint8] | None]],
    ) -> None:
        self._responses = responses
        self.released = False

    def set(self, prop_id: int, value: float) -> bool:
        del prop_id, value
        return True

    def read(self) -> tuple[bool, NDArray[np.uint8] | None]:
        if self._responses:
            return self._responses.pop(0)
        return False, None

    def release(self) -> None:
        self.released = True


class _ProbeBackend:
    def __init__(
        self,
        responses: list[tuple[bool, NDArray[np.uint8] | None]] | None = None,
        open_error: Exception | None = None,
    ) -> None:
        self.capture = _ProbeCapture(responses or [])
        self.open_error = open_error
        self.open_calls: list[tuple[str, int, int]] = []
        self.release_calls = 0

    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> _ProbeCapture:
        self.open_calls.append((url, open_timeout_ms, read_timeout_ms))
        if self.open_error is not None:
            raise self.open_error
        return self.capture

    def read(self, capture: _ProbeCapture) -> tuple[bool, NDArray[np.uint8] | None]:
        return capture.read()

    def release(self, capture: _ProbeCapture) -> None:
        self.release_calls += 1
        capture.release()


class _SequenceCapture:
    def __init__(self, reads: list[tuple[bool, NDArray[np.uint8] | None]]) -> None:
        self._reads = reads
        self.released = False

    def read(self) -> tuple[bool, NDArray[np.uint8] | None]:
        if not self._reads:
            return False, None
        return self._reads.pop(0)

    def release(self) -> None:
        self.released = True


class _SequenceBackend:
    def __init__(self, reads_by_open: list[list[tuple[bool, NDArray[np.uint8] | None]]]) -> None:
        self._reads_by_open = reads_by_open
        self.captures: list[_SequenceCapture] = []
        self.open_calls = 0
        self.release_calls = 0

    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> _SequenceCapture:
        del url, open_timeout_ms, read_timeout_ms
        self.open_calls += 1
        reads = self._reads_by_open.pop(0) if self._reads_by_open else []
        capture = _SequenceCapture(reads)
        self.captures.append(capture)
        return capture

    def read(self, capture: _SequenceCapture) -> tuple[bool, NDArray[np.uint8] | None]:
        return capture.read()

    def release(self, capture: _SequenceCapture) -> None:
        self.release_calls += 1
        capture.release()


def test_rtsp_source_uses_injected_rgb_backend_without_double_conversion(monkeypatch) -> None:
    backend = _RecordingBackend()
    monkeypatch.setattr(
        backend.capture,
        "_frames",
        [
            np.array([[[10, 20, 30]]], dtype=np.uint8),
            np.array([[[40, 50, 60]]], dtype=np.uint8),
        ],
    )
    monkeypatch.setattr(cv2, "cvtColor", _fail_if_called)
    monkeypatch.setattr(
        "worker.sources.rtsp.time.monotonic",
        _monotonic_values((10.0, 10.25)),
    )

    frames = list(
        RTSPSource(
            "rtsp://camera/trackID=2",
            max_failures=1,
            open_timeout_ms=1234,
            read_timeout_ms=5678,
            backend=backend,
            max_total_reconnects=0,
            sleep=lambda _delay: None,
        )
    )

    assert backend.open_calls == [("rtsp://camera/trackID=2", 1234, 5678)]
    assert backend.release_calls == 1
    assert backend.capture.released is True
    assert [frame.index for frame in frames] == [0, 1]
    assert [frame.time_sec for frame in frames] == [0.0, 0.25]
    assert frames[0].image.tolist() == [[[10, 20, 30]]]
    assert frames[1].image.tolist() == [[[40, 50, 60]]]


def test_create_backend_defaults_to_auto_fallback(monkeypatch) -> None:
    monkeypatch.delenv("ML_RTSP_BACKEND", raising=False)

    assert isinstance(create_backend(), FallbackRTSPBackend)


def test_create_backend_selects_opencv_from_env(monkeypatch) -> None:
    monkeypatch.setenv("ML_RTSP_BACKEND", "OPENCV")

    assert isinstance(_create_backend(), OpenCVRTSPBackend)


def test_create_backend_selects_nvdec() -> None:
    assert isinstance(create_backend("nvdec"), NvdecRTSPBackend)


def test_create_backend_cpu_alias_maps_to_opencv() -> None:
    assert isinstance(create_backend("cpu"), OpenCVRTSPBackend)


def test_create_backend_rejects_unknown_backend() -> None:
    with pytest.raises(ValueError, match="Unsupported RTSP backend"):
        create_backend("vaapi")


class _FailingBackend:
    def open(self, url: str, open_timeout_ms: int, read_timeout_ms: int) -> object:
        raise RuntimeError("nvdec unavailable")

    def read(self, capture: object) -> tuple[bool, NDArray[np.uint8] | None]:
        return False, None

    def release(self, capture: object) -> None:
        return None


class _StubBackend:
    def __init__(self, frame: NDArray[np.uint8]) -> None:
        self._frame = frame
        self.opened = False
        self.released = False

    def open(self, url: str, open_timeout_ms: int, read_timeout_ms: int) -> object:
        self.opened = True
        return object()

    def read(self, capture: object) -> tuple[bool, NDArray[np.uint8] | None]:
        return True, self._frame

    def release(self, capture: object) -> None:
        self.released = True


def test_fallback_backend_uses_safe_backend_when_preferred_open_fails() -> None:
    frame = np.zeros((1, 1, 3), dtype=np.uint8)
    safe = _StubBackend(frame)
    backend = FallbackRTSPBackend([("nvdec", _FailingBackend()), ("opencv", safe)])

    capture = backend.open("rtsp://cam/live", 1000, 1000)
    ok, out = backend.read(capture)

    assert ok is True
    assert out is frame
    assert safe.opened is True


def test_fallback_backend_prefers_first_backend_that_yields_a_frame() -> None:
    preferred_frame = np.zeros((1, 1, 3), dtype=np.uint8)
    preferred = _StubBackend(preferred_frame)
    safe = _StubBackend(np.ones((1, 1, 3), dtype=np.uint8))
    backend = FallbackRTSPBackend([("nvdec", preferred), ("opencv", safe)])

    capture = backend.open("rtsp://cam/live", 1000, 1000)
    ok, out = backend.read(capture)

    assert ok is True
    assert out is preferred_frame  # validating frame is replayed, not lost
    assert safe.opened is False


def test_probe_first_frame_reports_resolution_channels_and_releases_capture() -> None:
    frame = np.zeros((2, 3, 3), dtype=np.uint8)
    backend = _ProbeBackend([(True, frame)])

    result = probe_first_frame(
        "rtsp://user:secret@camera.local/live?token=abc",
        backend=backend,
        timeout_ms=1000,
        open_timeout_ms=111,
        read_timeout_ms=222,
    )

    assert result.width == 3
    assert result.height == 2
    assert result.channels == 3
    assert result.masked_url == "rtsp://***:***@camera.local/live?token=%2A%2A%2A"
    assert backend.open_calls == [
        ("rtsp://user:secret@camera.local/live?token=abc", 111, 222)
    ]
    assert backend.release_calls == 1
    assert backend.capture.released is True


def test_probe_first_frame_classifies_timeout_and_releases_capture() -> None:
    backend = _ProbeBackend([(False, None), (False, None)])
    monotonic = _monotonic_values((0.0, 0.1, 0.2, 0.6))

    with pytest.raises(RTSPProbeError) as error:
        probe_first_frame(
            "rtsp://camera.local/live",
            backend=backend,
            timeout_ms=500,
            monotonic=monotonic,
        )

    assert error.value.error_class == "timeout"
    assert "rtsp://camera.local/live" in str(error.value)
    assert backend.release_calls == 1
    assert backend.capture.released is True


def test_probe_first_frame_classifies_decode_failure() -> None:
    backend = _ProbeBackend([(True, None)])

    with pytest.raises(RTSPProbeError) as error:
        probe_first_frame("rtsp://camera.local/live", backend=backend)

    assert error.value.error_class == "decode"
    assert "codec" in str(error.value)
    assert backend.release_calls == 1


def test_probe_first_frame_classifies_auth_and_masks_credentials() -> None:
    raw_url = "rtsp://operator:s3cr3t@camera.local/live?token=plain"
    backend = _ProbeBackend(open_error=RuntimeError(f"401 Unauthorized for {raw_url}"))

    with pytest.raises(RTSPProbeError) as error:
        probe_first_frame(raw_url, backend=backend)

    assert error.value.error_class == "auth"
    assert error.value.masked_url == (
        "rtsp://***:***@camera.local/live?token=%2A%2A%2A"
    )
    assert "operator" not in str(error.value)
    assert "s3cr3t" not in str(error.value)
    assert "plain" not in str(error.value)
    assert backend.release_calls == 0


def test_mask_rtsp_url_redacts_userinfo_and_sensitive_query_values() -> None:
    assert (
        mask_rtsp_url(
            "rtsp://user:password@host/stream"
            "?profile=main&username=admin&secret=abc"
        )
        == "rtsp://***:***@host/stream"
        "?profile=main&username=%2A%2A%2A&secret=%2A%2A%2A"
    )

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


def test_opencv_rtsp_backend_defaults_rtsp_transport_to_tcp(monkeypatch) -> None:
    monkeypatch.delenv("OPENCV_FFMPEG_CAPTURE_OPTIONS", raising=False)
    monkeypatch.setattr(cv2, "VideoCapture", lambda *args: _FakeCapture())

    OpenCVRTSPBackend().open("rtsp://camera/trackID=2", 1234, 5678)

    assert os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] == "rtsp_transport;tcp"


def test_opencv_rtsp_backend_preserves_operator_capture_options(monkeypatch) -> None:
    monkeypatch.setenv(
        "OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;udp|max_delay;500000"
    )
    monkeypatch.setattr(cv2, "VideoCapture", lambda *args: _FakeCapture())

    OpenCVRTSPBackend().open("rtsp://camera/trackID=2", 1234, 5678)

    assert (
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"]
        == "rtsp_transport;udp|max_delay;500000"
    )


def test_opencv_rtsp_backend_read_returns_rgb_frame() -> None:
    capture = _FakeCapture()

    read_ok, image = OpenCVRTSPBackend().read(capture)

    assert read_ok is True
    assert image is not None
    assert image.tolist() == [[[30, 20, 10]]]


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



def test_rtsp_source_reconnects_after_read_failures_and_resumes(monkeypatch) -> None:
    backend = _SequenceBackend(
        [
            [(False, None), (False, None)],
            [(True, np.array([[[1, 2, 3]]], dtype=np.uint8))],
        ]
    )
    sleeps: list[float] = []
    liveness: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "worker.sources.rtsp.time.monotonic",
        _monotonic_values((100.0,)),
    )
    source = RTSPSource(
        "rtsp://camera/trackID=2",
        max_failures=2,
        reconnect_initial_backoff_sec=0.5,
        reconnect_max_backoff_sec=2.0,
        max_total_reconnects=1,
        sleep=sleeps.append,
        backend=backend,
        pace_wait=lambda _delay: False,
    )
    source.set_liveness_callbacks(
        on_reconnecting=lambda reason: liveness.append(("degraded", reason)),
        on_recovered=lambda reason: liveness.append(("ready", reason)),
    )

    frame = next(iter(source))

    assert frame.index == 0
    assert frame.time_sec == 0.0
    assert frame.image.tolist() == [[[1, 2, 3]]]
    assert backend.open_calls == 2
    assert backend.release_calls == 2
    assert sleeps == [0.5]
    assert liveness == [("degraded", "read_failure"), ("ready", "read_recovered")]


def test_rtsp_source_backoff_is_bounded() -> None:
    source = RTSPSource(
        "rtsp://camera/trackID=2",
        reconnect_initial_backoff_sec=0.5,
        reconnect_max_backoff_sec=1.0,
        backend=_SequenceBackend([]),
    )

    assert [source._backoff_delay(reconnect) for reconnect in (1, 2, 3, 4)] == [
        0.5,
        1.0,
        1.0,
        1.0,
    ]


def test_rtsp_source_never_recovered_terminates_with_reconnect_budget() -> None:
    backend = _SequenceBackend(
        [
            [(False, None)],
            [(False, None)],
            [(False, None)],
        ]
    )
    sleeps: list[float] = []

    frames = list(
        RTSPSource(
            "rtsp://camera/trackID=2",
            max_failures=1,
            reconnect_initial_backoff_sec=0.25,
            reconnect_max_backoff_sec=1.0,
            max_total_reconnects=2,
            sleep=sleeps.append,
            backend=backend,
            pace_wait=lambda _delay: False,
        )
    )

    assert frames == []
    assert backend.open_calls == 3
    assert backend.release_calls == 3
    assert sleeps == [0.25, 0.5]


def test_rtsp_source_stop_predicate_cancels_reconnect_backoff_promptly() -> None:
    backend = _SequenceBackend(
        [
            [(False, None)],
        ]
    )
    stop = False
    waits: list[float] = []

    def backoff_wait(delay_sec: float) -> bool:
        nonlocal stop
        waits.append(delay_sec)
        stop = True
        return stop

    frames = list(
        RTSPSource(
            "rtsp://camera/trackID=2",
            max_failures=1,
            reconnect_initial_backoff_sec=30.0,
            reconnect_max_backoff_sec=30.0,
            max_total_reconnects=None,
            backoff_wait=backoff_wait,
            stop_requested=lambda: stop,
            backend=backend,
            pace_wait=lambda _delay: False,
        )
    )

    assert frames == []
    assert backend.open_calls == 1
    assert backend.release_calls == 1
    assert waits == [30.0]


def test_rtsp_source_records_offline_before_reconnect_budget_exhaustion() -> None:
    backend = _SequenceBackend(
        [
            [(False, None)],
            [(False, None)],
        ]
    )
    liveness: list[tuple[str, str]] = []
    source = RTSPSource(
        "rtsp://camera/trackID=2",
        max_failures=1,
        reconnect_initial_backoff_sec=0.25,
        reconnect_max_backoff_sec=1.0,
        max_total_reconnects=1,
        sleep=lambda _delay: None,
        backend=backend,
        pace_wait=lambda _delay: False,
    )
    source.set_liveness_callbacks(
        on_reconnecting=lambda reason: liveness.append(("degraded", reason)),
        on_recovered=lambda reason: liveness.append(("ready", reason)),
    )

    assert list(source) == []
    assert backend.open_calls == 2
    assert liveness == [("degraded", "read_failure")]

def test_rtsp_source_paces_processed_fps_with_injected_clock() -> None:
    image = np.array([[[1, 2, 3]]], dtype=np.uint8)
    backend = _SequenceBackend([[(True, image), (True, image), (True, image)]])
    now = 10.0
    waits: list[float] = []

    def clock() -> float:
        return now

    def pace_wait(delay_sec: float) -> bool:
        nonlocal now
        waits.append(delay_sec)
        now += delay_sec
        return False

    frames = list(
        RTSPSource(
            "rtsp://camera/trackID=2",
            max_failures=1,
            max_total_reconnects=0,
            target_fps=2.0,
            clock=clock,
            pace_wait=pace_wait,
            backend=backend,
        )
    )

    assert [frame.index for frame in frames] == [0, 1, 2]
    assert [frame.time_sec for frame in frames] == [0.0, 0.5, 1.0]
    assert waits == [0.5, 0.5, 0.5]


def test_rtsp_source_window_fill_wall_clock_matches_configured_fps() -> None:
    image = np.array([[[1, 2, 3]]], dtype=np.uint8)
    window_frames = 30
    fps = 5.0
    now = 100.0

    def clock() -> float:
        return now

    def pace_wait(delay_sec: float) -> bool:
        nonlocal now
        now += delay_sec
        return False

    frames = list(
        RTSPSource(
            "rtsp://camera/trackID=2",
            max_failures=1,
            max_total_reconnects=0,
            target_fps=fps,
            clock=clock,
            pace_wait=pace_wait,
            backend=_SequenceBackend([[(True, image) for _ in range(window_frames)]]),
        )
    )

    assert len(frames) == window_frames
    assert frames[-1].time_sec == (window_frames - 1) / fps

def _fail_if_called(*_args: object, **_kwargs: object) -> None:
    raise AssertionError("RTSPSource must not convert backend-provided RGB frames")


def _monotonic_values(values: tuple[float, ...]):
    iterator = iter(values)

    def next_value() -> float:
        return next(iterator)

    return next_value
