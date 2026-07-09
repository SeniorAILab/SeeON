from __future__ import annotations

import os
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
    """Decode RTSP streams into RGB uint8 frames."""
    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> RTSPCapture: ...

    # Returns (ok, frame) where frame is RGB NDArray[np.uint8] when ok is True.
    def read(self, capture: RTSPCapture) -> tuple[bool, NDArray[np.uint8] | None]: ...

    def release(self, capture: RTSPCapture) -> None: ...


class OpenCVRTSPBackend:
    def open(
        self,
        url: str,
        open_timeout_ms: int,
        read_timeout_ms: int,
    ) -> RTSPCapture:
        _ensure_rtsp_over_tcp()
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
        read_ok, frame_bgr = capture.read()
        if not read_ok or frame_bgr is None:
            return read_ok, None
        return True, cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    def release(self, capture: RTSPCapture) -> None:
        capture.release()


def set_capture_property(capture: RTSPCapture, name: str, value: int) -> None:
    prop = getattr(cv2, name, None)
    if prop is not None:
        capture.set(prop, value)

_RTSP_OVER_TCP_OPTION = "rtsp_transport;tcp"


def _ensure_rtsp_over_tcp() -> None:
    """Default OpenCV's FFmpeg RTSP transport to TCP.

    Live H.265 (HEVC) NVR substreams over the default UDP transport drop
    packets, corrupting reference frames and flooding the decoder with
    "First slice in a frame missing" / "Could not find ref with POC" /
    "Error constructing the frame RPS" errors that degrade detection. TCP
    trades a little latency for a lossless stream. Operators can override
    the whole option string via OPENCV_FFMPEG_CAPTURE_OPTIONS.
    """
    if not os.environ.get("OPENCV_FFMPEG_CAPTURE_OPTIONS"):
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = _RTSP_OVER_TCP_OPTION


__all__ = [
    "OpenCVRTSPBackend",
    "RTSPBackend",
    "RTSPCapture",
    "set_capture_property",
]
