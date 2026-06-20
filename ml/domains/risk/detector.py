from __future__ import annotations

from contracts.observation import FrameObservation
from domains.base import DomainDetector


class RiskDetector(DomainDetector):
    enabled = False

    def update(
        self,
        observation: FrameObservation,
        *,
        time_sec: float | None = None,
    ) -> tuple[object, ...]:
        raise RuntimeError("risk domain is disabled")
