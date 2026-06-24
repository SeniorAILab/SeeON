from __future__ import annotations

from typing import Protocol, runtime_checkable

import cv2
import numpy as np
from numpy.typing import NDArray


@runtime_checkable
class RTSPCapture(Protocol):
    def read(self) -> tuple[bool, NDArray[np.uint8] | None]: ...

    def release(self) -> None: ...

    def set(self, prop_id: int, value: float) -> bool: ...


@runtime_checkable
class RTSPBackend(Protocol):
    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> RTSPCapture: ...

    def read(self, capture: RTSPCapture) -> tuple[bool, NDArray[np.uint8] | None]: ...

    def release(self, capture: RTSPCapture) -> None: ...


class OpenCVRTSPBackend:
    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> RTSPCapture:
        params = [
            cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
            open_timeout_ms,
            cv2.CAP_PROP_READ_TIMEOUT_MSEC,
            read_timeout_ms,
        ]
        try:
            capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG, params)
        except (TypeError, cv2.error):
            try:
                capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            except TypeError:
                capture = cv2.VideoCapture(url)
        set_capture_property(capture, "CAP_PROP_BUFFERSIZE", 1)
        set_capture_property(capture, "CAP_PROP_READ_TIMEOUT_MSEC", read_timeout_ms)
        return capture

    def read(self, capture: RTSPCapture) -> tuple[bool, NDArray[np.uint8] | None]:
        return capture.read()

    def release(self, capture: RTSPCapture) -> None:
        capture.release()


def set_capture_property(capture: RTSPCapture, name: str, value: int) -> None:
    prop = getattr(cv2, name, None)
    if prop is not None:
        capture.set(prop, value)


__all__ = ["OpenCVRTSPBackend", "RTSPBackend", "RTSPCapture", "set_capture_property"]
