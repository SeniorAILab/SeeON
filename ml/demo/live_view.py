from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import numpy as np
from numpy.typing import NDArray

from core.bed_detector import BedDetector
from core.bed_exit import BedExitMonitor
from core.contract import FrameSource, ModelModule
from core.events import BedExitLatch, DetectionLossMonitor, FallEventLatch, render_due
from core.playback_status import CurrentPlaybackStatus, current_playback_status
from demo.yolo_overlay import render_yolo_overlay

__all__ = [
    "BedExitLatch",
    "DetectionLossMonitor",
    "FallEventLatch",
    "iter_live_frames",
    "render_due",
]


def iter_live_frames(
    source: FrameSource,
    model: ModelModule,
    *,
    show_boxes: bool = True,
    show_pose: bool = True,
    bed_detector: BedDetector | None = None,
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
    bed_boxes = None
    bed_exit_monitor = BedExitMonitor()
    detector = bed_detector
    bed_exit_latch = BedExitLatch()
    for frame in source:
        if bed_boxes is None:
            bed_boxes = detector.detect(frame) if detector is not None else ()
        result = model.predict(frame)
        bed_exit_frame = bed_exit_monitor.update(
            bed_boxes=bed_boxes,
            person_boxes=result.boxes,
        )
        result = replace(
            result,
            bed_boxes=bed_boxes,
            bed_exit_statuses=bed_exit_frame.statuses,
        )
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
        bed_exit_events = bed_exit_latch.update(bed_exit_frame.events, frame.time_sec)
        status = replace(
            status,
            bed_count=len(bed_boxes or ()),
            bed_exit_events=bed_exit_events,
            bed_exit_event_count=bed_exit_latch.event_count,
            first_bed_exit_sec=bed_exit_latch.first_event_sec,
        )
        confidence = max((label.confidence for label in result.labels), default=0.0)
        yield overlay, status, confidence
