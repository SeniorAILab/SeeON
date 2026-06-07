from __future__ import annotations

from demo.playback_status import current_playback_status
from demo.realtime import FallStatus
from demo.yolo_runtime import YoloFrameAnalysis


def test_current_status_reports_not_fall_when_no_model_detects_fall() -> None:
    status = current_playback_status(
        analyses=(
            _analysis(model_id="model-a", status=FallStatus.WATCHING),
            _analysis(model_id="model-b", status=FallStatus.WATCHING),
        ),
        pose_count=1,
        time_sec=1.25,
    )

    assert status.label == "정상"
    assert status.is_fall is False
    assert status.detail == "1.25s / 낙상 없음"
    assert status.pose_label == "포즈 감지: 1명"


def test_current_status_reports_fall_with_peak_model_when_any_model_detects_fall() -> None:
    status = current_playback_status(
        analyses=(
            _analysis(model_id="low", status=FallStatus.FALL_DETECTED, confidence=0.3),
            _analysis(model_id="high", status=FallStatus.FALL_DETECTED, confidence=0.8),
        ),
        pose_count=2,
        time_sec=2.5,
    )

    assert status.label == "낙상"
    assert status.is_fall is True
    assert status.detail == "2.50s / 낙상 감지"
    assert status.pose_label == "포즈 감지: 2명"


def _analysis(
    model_id: str,
    status: FallStatus,
    confidence: float = 0.0,
) -> YoloFrameAnalysis:
    return YoloFrameAnalysis(
        model_id=model_id,
        frame_index=0,
        time_sec=0.0,
        detections=(),
        status=status,
        peak_confidence=confidence,
        fall_label="fall" if status is FallStatus.FALL_DETECTED else None,
    )
