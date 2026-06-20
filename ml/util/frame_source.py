from __future__ import annotations

# Re-exported so existing tests can monkeypatch the shared cv2 module via the
# util.frame_source shim path; the implementations now live in sources/ and use
# the same cv2 module object. Removed with util/ in Slice 11.
import cv2  # noqa: F401

from contracts.frame import Frame, FrameSource
from sources.video_file import VideoFileSource
from sources.webcam import CameraSource

__all__ = ["Frame", "FrameSource", "VideoFileSource", "CameraSource"]
