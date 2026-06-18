from __future__ import annotations

from dataclasses import dataclass, field

try:
    from core.seam import DetectionResult
except ModuleNotFoundError:
    from seam import DetectionResult  # type: ignore[no-redef]


BedExitEvents = tuple[object, ...]


@dataclass(frozen=True, slots=True)
class CurrentPlaybackStatus:
    label: str
    detail: str
    pose_label: str
    pose_count: int
    is_fall: bool
    bed_count: int = 0
    bed_exit_events: BedExitEvents = field(default_factory=tuple)
    bed_exit_event_count: int = 0
    first_bed_exit_sec: float | None = None


def current_playback_status(
    result: DetectionResult,
    pose_count: int,
    time_sec: float,
) -> CurrentPlaybackStatus:
    pose_label = f"포즈 감지: {pose_count}명" if pose_count else "포즈 대기"
    is_fall = any(label.is_fall for label in result.labels)
    if not is_fall:
        return CurrentPlaybackStatus(
            label="정상",
            detail=f"{time_sec:.2f}s / 낙상 없음",
            pose_label=pose_label,
            pose_count=pose_count,
            is_fall=False,
        )
    return CurrentPlaybackStatus(
        label="낙상",
        detail=f"{time_sec:.2f}s / 낙상 감지",
        pose_label=pose_label,
        pose_count=pose_count,
        is_fall=True,
    )
