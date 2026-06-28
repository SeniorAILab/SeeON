from __future__ import annotations

import time
from collections.abc import Iterator

import cv2

from contracts.frame import Frame
from worker.sources.rtsp_backend import (
    OpenCVRTSPBackend,
    RTSPBackend,
)


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
        backend = _create_backend()
        capture = backend.open(
            self._url,
            self._open_timeout_ms,
            self._read_timeout_ms,
        )
        try:
            t0: float | None = None
            frame_index = 0
            consecutive_failures = 0
            while True:
                read_ok, frame_bgr = backend.read(capture)
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
            backend.release(capture)


def _create_backend() -> RTSPBackend:
    return OpenCVRTSPBackend()


__all__ = ["RTSPSource"]
