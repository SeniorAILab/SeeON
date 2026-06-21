from __future__ import annotations

import time
from collections.abc import Iterator
from pathlib import Path

import cv2

from contracts.frame import Frame, FrameSource


class VideoFileSource:
    """Frame source over a stored video file.

    Owns a self-contained ``cv2.VideoCapture`` read loop so the frame-intake
    abstraction depends on nothing in ``demo/``. A stored video and a live
    stream are the same "frame source" to downstream consumers — this is the
    계약(contract) serving / realtime reuse, hence its home in ``ml/util/`` (ADR-006).
    """

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
        capture = cv2.VideoCapture(self._source)
        try:
            fps = float(capture.get(cv2.CAP_PROP_FPS) or 12.0)
            raw_index = max(0, int(max(self._start_sec, 0.0) * max(fps, 1.0)))
            capture.set(cv2.CAP_PROP_POS_FRAMES, raw_index)
            frame_index = 0
            while True:
                read_ok, frame_bgr = capture.read()
                if not read_ok:
                    break
                if raw_index % self._frame_stride == 0:
                    time_sec = raw_index / max(fps, 1.0)
                    image = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                    yield Frame(index=frame_index, time_sec=round(time_sec, 3), image=image)
                    frame_index += 1
                raw_index += 1
        finally:
            capture.release()


class CameraSource:
    """Frame source over a live camera device (cv2.VideoCapture by index).

    Implements the FrameSource protocol for real-time capture so the downstream
    iter_live_frames loop requires no changes — camera and file sources share
    the same 계약(contract) (ADR-006).

    Unlike VideoFileSource there is no fps metadata to trust for time_sec;
    time_sec uses time.monotonic() elapsed since the first frame so timestamps
    remain meaningful even when the camera feed stutters.

    CAP_PROP_BUFFERSIZE=1 keeps the internal queue at one frame so each read
    returns the most recently captured image rather than a stale buffered one.
    """

    def __init__(self, device_index: int, max_failures: int = 30) -> None:
        self._device_index = device_index
        self._max_failures = max_failures

    def __iter__(self) -> Iterator[Frame]:
        capture = cv2.VideoCapture(self._device_index)
        # Prefer the latest frame: drop stale buffer so each read returns fresh data.
        capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        try:
            t0: float | None = None
            frame_index = 0
            consecutive_failures = 0
            while True:
                read_ok, frame_bgr = capture.read()
                if not read_ok:
                    consecutive_failures += 1
                    if consecutive_failures >= self._max_failures:
                        break
                    continue
                consecutive_failures = 0
                now = time.monotonic()
                if t0 is None:
                    t0 = now
                time_sec = round(now - t0, 3)
                image = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                yield Frame(index=frame_index, time_sec=time_sec, image=image)
                frame_index += 1
        finally:
            capture.release()

__all__ = ["Frame", "FrameSource", "VideoFileSource", "CameraSource"]
