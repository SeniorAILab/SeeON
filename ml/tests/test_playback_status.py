from __future__ import annotations

from demo.playback_status import current_playback_status
from demo.seam import DetectionLabel, DetectionResult


def test_current_status_reports_not_fall_when_no_fall_labels() -> None:
    status = current_playback_status(
        result=DetectionResult(),
        pose_count=1,
        time_sec=1.25,
    )

    assert status.label == "정상"
    assert status.is_fall is False
    assert status.detail == "1.25s / 낙상 없음"
    assert status.pose_label == "포즈 감지: 1명"


def test_current_status_reports_fall_when_any_label_is_fall() -> None:
    status = current_playback_status(
        result=DetectionResult(
            labels=(
                DetectionLabel(text="standing", confidence=0.3, is_fall=False),
                DetectionLabel(text="fall", confidence=0.8, is_fall=True),
            )
        ),
        pose_count=2,
        time_sec=2.5,
    )

    assert status.label == "낙상"
    assert status.is_fall is True
    assert status.detail == "2.50s / 낙상 감지"
    assert status.pose_label == "포즈 감지: 2명"


def test_current_status_not_fall_with_non_fall_labels_only() -> None:
    status = current_playback_status(
        result=DetectionResult(
            labels=(
                DetectionLabel(text="standing", confidence=0.9, is_fall=False),
            )
        ),
        pose_count=0,
        time_sec=0.5,
    )

    assert status.is_fall is False
    assert status.pose_label == "포즈 대기"


def test_current_status_pose_label_absent_when_zero_pose_count() -> None:
    status = current_playback_status(
        result=DetectionResult(),
        pose_count=0,
        time_sec=0.0,
    )

    assert status.pose_label == "포즈 대기"
