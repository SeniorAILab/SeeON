from __future__ import annotations

import numpy as np

from demo.model_registry import FramePrediction, PoseFrame, select_demo_model
from demo.realtime import (
    FallStatus,
    FrameAnalysis,
    analyze_timeline,
    build_fall_events,
    build_fall_events_with_rules,
    render_pose_overlay,
)


def test_generates_pose_overlay_frames_and_alerts_on_threshold_crossing() -> None:
    model = select_demo_model("demo-fall-pose", threshold=0.6)
    frame = np.zeros((96, 128, 3), dtype=np.uint8)

    analyses = list(
        analyze_timeline(
            frame_count=8,
            fps=4.0,
            frame_shape=frame.shape,
            model=model,
        )
    )
    overlay = render_pose_overlay(frame=frame, analysis=analyses[-1])
    events = build_fall_events(analyses)

    assert analyses[0].status is FallStatus.WATCHING
    assert any(analysis.status is FallStatus.FALL_DETECTED for analysis in analyses)
    assert np.count_nonzero(overlay) > 0
    assert events[0].start_sec <= events[0].end_sec
    assert events[0].peak_confidence >= model.threshold


def test_status_stays_watching_when_predictions_stay_below_threshold() -> None:
    model = select_demo_model("demo-stable-pose", threshold=0.8)

    analyses = list(
        analyze_timeline(
            frame_count=8,
            fps=4.0,
            frame_shape=(96, 128, 3),
            model=model,
        )
    )
    events = build_fall_events(analyses)

    assert {analysis.status for analysis in analyses} == {FallStatus.WATCHING}
    assert events == []


def test_merges_nearby_events_before_filtering_short_intervals() -> None:
    analyses = [
        _analysis(time_sec=0.0, score=0.8, status=FallStatus.FALL_DETECTED),
        _analysis(time_sec=0.5, score=0.9, status=FallStatus.FALL_DETECTED),
        _analysis(time_sec=1.0, score=0.2, status=FallStatus.WATCHING),
        _analysis(time_sec=1.4, score=0.7, status=FallStatus.FALL_DETECTED),
        _analysis(time_sec=1.9, score=0.95, status=FallStatus.FALL_DETECTED),
        _analysis(time_sec=2.4, score=0.2, status=FallStatus.WATCHING),
        _analysis(time_sec=3.0, score=0.8, status=FallStatus.FALL_DETECTED),
    ]

    events = build_fall_events_with_rules(
        analyses=analyses,
        min_event_sec=1.0,
        merge_gap_sec=0.95,
    )

    assert len(events) == 1
    assert events[0].start_sec == 0.0
    assert events[0].end_sec == 1.9
    assert events[0].peak_confidence == 0.95
    assert events[0].frames == 4


def _analysis(time_sec: float, score: float, status: FallStatus) -> FrameAnalysis:
    return FrameAnalysis(
        frame_index=int(time_sec * 10),
        time_sec=time_sec,
        prediction=FramePrediction(
            model_id="demo-fall-pose",
            label="fall_candidate",
            fall_score=score,
            pose=PoseFrame(keypoints=()),
        ),
        status=status,
    )
