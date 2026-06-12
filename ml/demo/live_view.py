from __future__ import annotations

from collections.abc import Iterator

import numpy as np
from numpy.typing import NDArray

from demo.playback_status import CurrentPlaybackStatus, current_playback_status
from demo.seam import FrameSource, ModelModule
from demo.yolo_overlay import render_yolo_overlay


def render_due(
    frame_count: int,
    render_stride: int,
    *,
    is_fall: bool,
    last_painted_fall: bool,
) -> bool:
    """Decide whether the UI should repaint for this processed frame.

    Inference always runs on every consecutive frame (train/serve parity,
    ADR-013); only *painting* is decimated to every ``render_stride``-th
    frame. A change in fall state repaints immediately so decimation can
    never delay an alarm — in either direction.
    """
    if is_fall != last_painted_fall:
        return True
    return frame_count % max(1, render_stride) == 0


def iter_live_frames(
    source: FrameSource,
    model: ModelModule,
    *,
    show_boxes: bool = True,
    show_pose: bool = True,
) -> Iterator[tuple[NDArray[np.uint8], CurrentPlaybackStatus, float]]:
    """Yield ``(overlay, status, confidence)`` per source frame for live rendering.

    The pure inference+render core of the real-time viewer (ADR-010): one frame
    in → one annotated frame + fall state out, emitted incrementally so a caller
    can paint each frame the moment it is processed instead of waiting for a
    pre-rendered file.

    It has **no Streamlit, no ``cv2.VideoCapture``, and no ultralytics import**:
    frame intake is the injected ``source`` (any ``FrameSource``) and inference
    is the injected ``model`` (any ``ModelModule``). That keeps it unit-testable
    with fakes — drive it with a scripted ``DetectionResult`` to assert ordering
    and fall-state propagation without a real model or UI.

    ``confidence`` is the strongest label confidence on the frame (the primary
    person's classifier ramp once a fall classifier is composed in), surfaced so
    the UI can show how close the fire state is.
    """
    for frame in source:
        result = model.predict(frame)
        overlay = render_yolo_overlay(
            frame=frame.image,
            result=result,
            show_boxes=show_boxes,
            show_pose=show_pose,
        )
        status = current_playback_status(
            result=result,
            pose_count=len(result.keypoints),
            time_sec=frame.time_sec,
        )
        confidence = max((label.confidence for label in result.labels), default=0.0)
        yield overlay, status, confidence
