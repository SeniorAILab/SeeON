from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

try:
    from demo.realtime import FallStatus
    from demo.yolo_runtime import YoloFrameAnalysis
except ModuleNotFoundError:
    from realtime import FallStatus
    from yolo_runtime import YoloFrameAnalysis


@dataclass(frozen=True, slots=True)
class CurrentPlaybackStatus:
    label: str
    detail: str
    pose_label: str
    is_fall: bool


def current_playback_status(
    analyses: Sequence[YoloFrameAnalysis],
    pose_count: int,
    time_sec: float,
) -> CurrentPlaybackStatus:
    pose_label = f"포즈 감지: {pose_count}명" if pose_count else "포즈 대기"
    fall_analyses = [
        analysis for analysis in analyses if analysis.status is FallStatus.FALL_DETECTED
    ]
    if not fall_analyses:
        return CurrentPlaybackStatus(
            label="정상",
            detail=f"{time_sec:.2f}s / 낙상 없음",
            pose_label=pose_label,
            is_fall=False,
        )
    return CurrentPlaybackStatus(
        label="낙상",
        detail=f"{time_sec:.2f}s / 낙상 감지",
        pose_label=pose_label,
        is_fall=True,
    )
