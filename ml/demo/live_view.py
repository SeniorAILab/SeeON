from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import numpy as np
from numpy.typing import NDArray

from contracts.frame import Frame, FrameSource
from contracts.model import ModelModule
from contracts.observation import BoundingBox, FrameObservation
from demo.bed_detector import BedDetector
from demo.playback_status import CurrentPlaybackStatus, current_playback_status
from demo.render import DetectionLossMonitor, render_due
from demo.yolo_overlay import render_yolo_overlay
from worker.domains.bed_exit import BedExitMonitor
from worker.domains.bed_exit.latch import BedExitLatch
from worker.domains.fall.detector import FallEventLatch

__all__ = [
    "BedExitLatch",
    "DetectionLossMonitor",
    "FallEventLatch",
    "iter_live_frames",
    "render_due",
]

BED_SEED_FRAME_COUNT = 8
BED_REDETECT_INTERVAL_FRAMES = 30


def iter_live_frames(
    source: FrameSource,
    model: ModelModule,
    *,
    show_boxes: bool = True,
    show_pose: bool = True,
    bed_detector: BedDetector | None = None,
    bed_seed_frame_count: int = BED_SEED_FRAME_COUNT,
    bed_redetect_interval: int = BED_REDETECT_INTERVAL_FRAMES,
) -> Iterator[tuple[NDArray[np.uint8], CurrentPlaybackStatus, float]]:
    """Yield ``(overlay, status, confidence)`` per source frame for live rendering.

    The pure inference+render loop of the real-time viewer (ADR): one frame
    in → one annotated frame + fall state out, emitted incrementally so a caller
    can paint each frame the moment it is processed instead of waiting for a
    pre-rendered file.

    It has **no Streamlit, no ``cv2.VideoCapture``, and no ultralytics import**:
    frame intake is the injected ``source`` (any ``FrameSource``) and inference
    is the injected ``model`` (any ``ModelModule``). That keeps it unit-testable
    with fakes — drive it with a scripted ``FrameObservation`` to assert ordering
    and fall-state propagation without a real model or UI.

    ``confidence`` is the strongest label confidence on the frame (the primary
    person's classifier ramp once a fall classifier is composed in), surfaced so
    the UI can show how close the fire state is.
    Bed ROIs are seeded from the first ``bed_seed_frame_count`` frames and then
    refreshed every ``bed_redetect_interval`` frames. The default interval is
    30 frames: sparse enough to avoid per-frame bed inference, frequent enough
    to recover when later frames expose additional beds.

    """
    bed_boxes: tuple[BoundingBox, ...] = ()
    bed_exit_monitor = BedExitMonitor()
    detector = bed_detector
    bed_exit_latch = BedExitLatch()
    seed_frames: list[Frame] = []
    pending_frames: list[Frame] = []
    normalized_seed_count = max(1, bed_seed_frame_count)
    normalized_redetect_interval = max(1, bed_redetect_interval)

    def detect_union(frames: tuple[Frame, ...]) -> tuple[BoundingBox, ...]:
        if detector is None or not frames:
            return ()
        union_detector = getattr(detector, "detect_union", None)
        if union_detector is not None:
            return union_detector(frames)
        return detector.detect(frames[0])

    def process_frame(
        frame: Frame, current_bed_boxes: tuple[BoundingBox, ...]
    ) -> tuple[NDArray[np.uint8], CurrentPlaybackStatus, float]:
        result = model.predict(frame)
        bed_exit_frame = bed_exit_monitor.update_boxes(
            bed_boxes=current_bed_boxes,
            person_boxes=result.boxes,
        )
        result = FrameObservation(
            detections=result.detections,
            poses=result.poses,
            regions=(current_bed_boxes, bed_exit_frame.statuses),
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
            bed_count=len(current_bed_boxes),
            bed_exit_events=bed_exit_events,
            bed_exit_event_count=bed_exit_latch.event_count,
            first_bed_exit_sec=bed_exit_latch.first_event_sec,
        )
        confidence = max((label.confidence for label in result.labels), default=0.0)
        return overlay, status, confidence

    for frame in source:
        if detector is None:
            yield process_frame(frame, ())
            continue

        if len(seed_frames) < normalized_seed_count:
            seed_frames.append(frame)
            pending_frames.append(frame)
            if len(seed_frames) < normalized_seed_count:
                continue
            bed_boxes = detect_union(tuple(seed_frames))
            for pending_frame in pending_frames:
                yield process_frame(pending_frame, bed_boxes)
            pending_frames.clear()
            continue

        if frame.index % normalized_redetect_interval == 0:
            updated_bed_boxes = detector.detect(frame)
            if updated_bed_boxes:
                bed_boxes = updated_bed_boxes
        yield process_frame(frame, bed_boxes)

    if pending_frames:
        bed_boxes = detect_union(tuple(seed_frames))
        for pending_frame in pending_frames:
            yield process_frame(pending_frame, bed_boxes)
