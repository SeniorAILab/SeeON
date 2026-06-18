from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

import numpy as np
from numpy.typing import NDArray

from demo.bed_detector import BedDetector
from demo.bed_exit import BedExitEvent, BedExitMonitor
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


class FallEventLatch:
    """Latch fall *events* out of the per-frame fall signal.

    The per-window classifier honestly returns to 정상 once the fall motion
    exits its window — correct trained semantics, but the "a fall happened"
    fact would vanish from screen. This helper detects rising edges
    (정상→낙상) and remembers the first onset time and total onset count so
    the UI can keep a latched badge. Pure aggregation of real inference
    outputs — it never invents a fall (ADR-027). Product-grade alerting
    (ack flow, notifications) is backend scope (ADR-023).
    """

    def __init__(self) -> None:
        self.event_count: int = 0
        self.first_event_sec: float | None = None
        self._prev_fall: bool = False

    def update(self, is_fall: bool, time_sec: float) -> bool:
        """Feed one frame's fall state; return True on a rising edge (new event)."""
        onset = is_fall and not self._prev_fall
        if onset:
            self.event_count += 1
            if self.first_event_sec is None:
                self.first_event_sec = time_sec
        self._prev_fall = is_fall
        return onset


class BedExitLatch:
    """Latch bed-exit events out of the per-frame bed-exit monitor output.

    Bed-exit monitor events are discrete facts. This helper records only real
    rising-edge ``(person_id, bed_id)`` events, dedupes sustained duplicate
    frames, and remembers the first event time and total count for callers that
    need a stable badge or alert trigger.
    """

    def __init__(self) -> None:
        self.event_count: int = 0
        self.first_event_sec: float | None = None
        self._active_exits: set[tuple[int, int]] = set()

    def update(self, events: tuple[BedExitEvent, ...], time_sec: float) -> tuple[BedExitEvent, ...]:
        """Feed one frame's bed-exit events; return newly latched onsets."""
        event_keys = {(event.person_id, event.bed_id) for event in events}
        onset_events = tuple(
            event for event in events if (event.person_id, event.bed_id) not in self._active_exits
        )
        if onset_events:
            self.event_count += len(onset_events)
            if self.first_event_sec is None:
                self.first_event_sec = time_sec
        self._active_exits = event_keys
        return onset_events


class DetectionLossMonitor:
    def __init__(self, *, loss_after_sec: float = 5.0) -> None:
        self._loss_after_sec = loss_after_sec
        self._has_seen_pose = False
        self._zero_pose_since_sec: float | None = None
        self._emitted_for_current_loss = False

    def update(self, *, pose_count: int, time_sec: float) -> bool:
        if pose_count > 0:
            self._has_seen_pose = True
            self._zero_pose_since_sec = None
            self._emitted_for_current_loss = False
            return False
        if not self._has_seen_pose:
            return False
        if self._zero_pose_since_sec is None:
            self._zero_pose_since_sec = time_sec
            return False
        if self._emitted_for_current_loss:
            return False
        if time_sec - self._zero_pose_since_sec < self._loss_after_sec:
            return False
        self._emitted_for_current_loss = True
        return True


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
