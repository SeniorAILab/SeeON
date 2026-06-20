from __future__ import annotations

import cv2  # noqa: F401

from contracts.frame import Frame, FrameSource
from sources.video_file import VideoFileSource
from sources.webcam import CameraSource

__all__ = ["Frame", "FrameSource", "VideoFileSource", "CameraSource"]
