from __future__ import annotations

from contracts.observation import FrameObservation
from domains.base import DomainDetector


class WheelchairStandupDetector(DomainDetector):
    enabled = False

    def update(
        self,
        observation: FrameObservation,
        *,
        time_sec: float | None = None,
    ) -> tuple[object, ...]:
        raise RuntimeError("wheelchair_standup domain is disabled")
