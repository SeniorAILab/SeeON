from __future__ import annotations

import cv2  # noqa: F401

from contracts.frame import Frame, FrameSource
from worker.sources.rtsp import RTSPSource
from worker.sources.video_file import VideoFileSource
from worker.sources.webcam import CameraSource

__all__ = ["Frame", "FrameSource", "VideoFileSource", "CameraSource", "RTSPSource"]
