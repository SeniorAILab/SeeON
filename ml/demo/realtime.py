from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

import numpy as np
from numpy.typing import NDArray

try:
    from demo.model_registry import DemoFallModel, FramePrediction, PoseFrame, PosePoint
except ModuleNotFoundError:
    from model_registry import DemoFallModel, FramePrediction, PoseFrame, PosePoint


class FallStatus(StrEnum):
    WATCHING = "watching"
    FALL_DETECTED = "fall_detected"


@dataclass(frozen=True, slots=True)
class FrameAnalysis:
    frame_index: int
    time_sec: float
    prediction: FramePrediction
    status: FallStatus


@dataclass(frozen=True, slots=True)
class FallEvent:
    model_id: str
    start_sec: float
    end_sec: float
    peak_confidence: float
    frames: int
    label: str


SKELETON_EDGES: Final[tuple[tuple[int, int], ...]] = (
    (0, 1),
    (0, 2),
    (1, 3),
    (2, 4),
    (3, 4),
    (3, 5),
    (4, 6),
)


def analyze_timeline(
    frame_count: int,
    fps: float,
    frame_shape: tuple[int, int, int],
    model: DemoFallModel,
) -> Iterator[FrameAnalysis]:
    safe_fps = max(fps, 1.0)
    for frame_index in range(frame_count):
        time_sec = frame_index / safe_fps
        prediction = model.predict_frame(
            frame_index=frame_index,
            time_sec=time_sec,
            frame_shape=frame_shape,
        )
        status = (
            FallStatus.FALL_DETECTED
            if prediction.fall_score >= model.threshold
            else FallStatus.WATCHING
        )
        yield FrameAnalysis(
            frame_index=frame_index,
            time_sec=round(time_sec, 3),
            prediction=prediction,
            status=status,
        )


def render_pose_overlay(
    frame: NDArray[np.uint8],
    analysis: FrameAnalysis,
) -> NDArray[np.uint8]:
    overlay = frame.copy()
    color = (
        np.array([255, 48, 48], dtype=np.uint8)
        if analysis.status is FallStatus.FALL_DETECTED
        else np.array([64, 220, 120], dtype=np.uint8)
    )
    _draw_pose(overlay=overlay, pose=analysis.prediction.pose, color=color)
    if analysis.status is FallStatus.FALL_DETECTED:
        overlay[:4, :, :] = color
        overlay[-4:, :, :] = color
        overlay[:, :4, :] = color
        overlay[:, -4:, :] = color
    return overlay


def build_fall_events(analyses: Iterable[FrameAnalysis]) -> list[FallEvent]:
    return build_fall_events_with_rules(
        analyses=analyses,
        min_event_sec=0.0,
        merge_gap_sec=0.0,
    )


def build_fall_events_with_rules(
    analyses: Iterable[FrameAnalysis],
    min_event_sec: float,
    merge_gap_sec: float,
) -> list[FallEvent]:
    raw_events: list[FallEvent] = []
    current: list[FrameAnalysis] = []
    for analysis in analyses:
        if analysis.status is FallStatus.FALL_DETECTED:
            current.append(analysis)
            continue
        if current:
            raw_events.append(_event_from_frames(current))
            current = []
    if current:
        raw_events.append(_event_from_frames(current))
    merged_events = _merge_nearby_events(raw_events, merge_gap_sec=max(merge_gap_sec, 0.0))
    return [
        event
        for event in merged_events
        if _event_duration(event) >= max(min_event_sec, 0.0)
    ]


def _event_from_frames(frames: list[FrameAnalysis]) -> FallEvent:
    peak = max(frame.prediction.fall_score for frame in frames)
    first = frames[0]
    last = frames[-1]
    return FallEvent(
        model_id=first.prediction.model_id,
        start_sec=first.time_sec,
        end_sec=last.time_sec,
        peak_confidence=peak,
        frames=len(frames),
        label="fall_candidate",
    )


def _merge_nearby_events(events: list[FallEvent], merge_gap_sec: float) -> list[FallEvent]:
    if not events:
        return []
    merged: list[FallEvent] = [events[0]]
    for event in events[1:]:
        previous = merged[-1]
        if event.start_sec <= previous.end_sec + merge_gap_sec:
            merged[-1] = _merge_event_pair(previous=previous, event=event)
            continue
        merged.append(event)
    return merged


def _merge_event_pair(previous: FallEvent, event: FallEvent) -> FallEvent:
    return FallEvent(
        model_id=previous.model_id,
        start_sec=previous.start_sec,
        end_sec=max(previous.end_sec, event.end_sec),
        peak_confidence=max(previous.peak_confidence, event.peak_confidence),
        frames=previous.frames + event.frames,
        label=previous.label,
    )


def _event_duration(event: FallEvent) -> float:
    return max(event.end_sec - event.start_sec, 0.0)


def _draw_pose(overlay: NDArray[np.uint8], pose: PoseFrame, color: NDArray[np.uint8]) -> None:
    points = pose.keypoints
    for start_index, end_index in SKELETON_EDGES:
        _draw_line(
            overlay=overlay,
            start=points[start_index],
            end=points[end_index],
            color=color,
        )
    for point in points:
        _draw_point(overlay=overlay, point=point, color=color)


def _draw_point(overlay: NDArray[np.uint8], point: PosePoint, color: NDArray[np.uint8]) -> None:
    height, width, _channels = overlay.shape
    x_min = max(point.x - 2, 0)
    x_max = min(point.x + 3, width)
    y_min = max(point.y - 2, 0)
    y_max = min(point.y + 3, height)
    overlay[y_min:y_max, x_min:x_max, :] = color


def _draw_line(
    overlay: NDArray[np.uint8],
    start: PosePoint,
    end: PosePoint,
    color: NDArray[np.uint8],
) -> None:
    height, width, _channels = overlay.shape
    steps = max(abs(end.x - start.x), abs(end.y - start.y), 1)
    xs = np.linspace(start.x, end.x, steps + 1).astype(np.int64)
    ys = np.linspace(start.y, end.y, steps + 1).astype(np.int64)
    valid = (xs >= 0) & (xs < width) & (ys >= 0) & (ys < height)
    overlay[ys[valid], xs[valid], :] = color
