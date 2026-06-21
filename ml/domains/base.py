from __future__ import annotations

from abc import ABC, abstractmethod

from contracts.observation import FrameObservation


class DomainDetector(ABC):
    """Common interface for domain-level observation interpreters."""

    enabled: bool

    @abstractmethod
    def update(
        self,
        observation: FrameObservation,
        *,
        time_sec: float | None = None,
    ) -> tuple[object, ...]:
        """Interpret one observation/scene state and return domain events."""
