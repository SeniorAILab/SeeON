from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray


@dataclass(frozen=True, slots=True)
class VideoPlaybackInfo:
    fps: float
    frame_count: int
    duration_sec: float


def read_video_playback_info(path: Path) -> VideoPlaybackInfo:
    capture = cv2.VideoCapture(str(path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 12.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration_sec = round(frame_count / max(fps, 1.0), 2) if frame_count else 0.0
        return VideoPlaybackInfo(fps=fps, frame_count=frame_count, duration_sec=duration_sec)
    finally:
        capture.release()


def clamp_seek_time(value_sec: float, duration_sec: float) -> float:
    return round(min(max(value_sec, 0.0), max(duration_sec, 0.0)), 2)


def jump_seek_time(current_sec: float, delta_sec: float, duration_sec: float) -> float:
    return clamp_seek_time(value_sec=current_sec + delta_sec, duration_sec=duration_sec)


def raw_frame_index_for_time(time_sec: float, fps: float) -> int:
    return max(0, int(max(time_sec, 0.0) * max(fps, 1.0)))


def read_frame_at_time(path: Path, time_sec: float) -> NDArray[np.uint8] | None:
    capture = cv2.VideoCapture(str(path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 12.0)
        capture.set(cv2.CAP_PROP_POS_FRAMES, raw_frame_index_for_time(time_sec=time_sec, fps=fps))
        read_ok, frame = capture.read()
        if not read_ok:
            return None
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    finally:
        capture.release()


def iter_playback_frames(
    path: Path,
    start_sec: float,
    frame_stride: int,
) -> Iterator[tuple[int, float, NDArray[np.uint8]]]:
    capture = cv2.VideoCapture(str(path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 12.0)
        raw_index = raw_frame_index_for_time(time_sec=start_sec, fps=fps)
        capture.set(cv2.CAP_PROP_POS_FRAMES, raw_index)
        frame_index = 0
        while True:
            read_ok, frame = capture.read()
            if not read_ok:
                break
            if raw_index % frame_stride == 0:
                time_sec = raw_index / max(fps, 1.0)
                yield frame_index, round(time_sec, 3), cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame_index += 1
            raw_index += 1
    finally:
        capture.release()
