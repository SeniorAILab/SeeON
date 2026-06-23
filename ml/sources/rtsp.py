from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Protocol

import cv2

from contracts.frame import Frame


class CapturePropertySetter(Protocol):
    def set(self, prop_id: int, value: float) -> bool: ...


class RTSPSource:
    def __init__(
        self,
        url: str,
        max_failures: int = 30,
        open_timeout_ms: int = 5000,
        read_timeout_ms: int = 5000,
    ) -> None:
        self._url = url
        self._max_failures = max(1, max_failures)
        self._open_timeout_ms = max(1, open_timeout_ms)
        self._read_timeout_ms = max(1, read_timeout_ms)

    def __iter__(self) -> Iterator[Frame]:
        capture = _open_capture(self._url, self._open_timeout_ms, self._read_timeout_ms)
        _set_capture_property(capture, "CAP_PROP_BUFFERSIZE", 1)
        _set_capture_property(capture, "CAP_PROP_READ_TIMEOUT_MSEC", self._read_timeout_ms)
        try:
            t0: float | None = None
            frame_index = 0
            consecutive_failures = 0
            while True:
                read_ok, frame_bgr = capture.read()
                if not read_ok or frame_bgr is None:
                    consecutive_failures += 1
                    if consecutive_failures >= self._max_failures:
                        break
                    continue
                consecutive_failures = 0
                now = time.monotonic()
                if t0 is None:
                    t0 = now
                image = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                yield Frame(index=frame_index, time_sec=round(now - t0, 3), image=image)
                frame_index += 1
        finally:
            capture.release()


def _open_capture(url: str, open_timeout_ms: int, read_timeout_ms: int):
    params = [
        cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
        open_timeout_ms,
        cv2.CAP_PROP_READ_TIMEOUT_MSEC,
        read_timeout_ms,
    ]
    try:
        return cv2.VideoCapture(url, cv2.CAP_FFMPEG, params)
    except (TypeError, cv2.error):
        try:
            return cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        except TypeError:
            return cv2.VideoCapture(url)


def _set_capture_property(capture: CapturePropertySetter, name: str, value: int) -> None:
    prop = getattr(cv2, name, None)
    if prop is not None:
        capture.set(prop, value)


__all__ = ["RTSPSource"]
