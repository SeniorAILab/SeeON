from __future__ import annotations

from contracts.event import MutableEventPayload
from contracts.observation import FrameObservation
from worker.domains.fall.schema import FallEvent


class FallEventLatch:
    """Latch fall events out of the per-frame fall signal."""

    enabled = True

    def __init__(self) -> None:
        self.event_count: int = 0
        self.first_event_sec: float | None = None
        self._prev_fall: bool = False

    def update(
        self,
        observation: FrameObservation,
        time_sec: float | None = None,
    ) -> tuple[MutableEventPayload, ...]:
        event = self.update_event(
            _observation_is_fall(observation),
            0.0 if time_sec is None else time_sec,
        )
        if event is None:
            return ()
        return (
            {
                "domain": "fall",
                "event_type": "fall",
                "identity": event.event_count,
                "probability": _observation_fall_probability(observation),
                "time_sec": event.onset_sec,
            },
        )

    def update_signal(self, is_fall: bool, time_sec: float | None = None) -> bool:
        if time_sec is None:
            time_sec = 0.0
        onset = is_fall and not self._prev_fall
        if onset:
            self.event_count += 1
            if self.first_event_sec is None:
                self.first_event_sec = time_sec
        self._prev_fall = is_fall
        return onset

    def update_event(self, is_fall: bool, time_sec: float) -> FallEvent | None:
        """Feed one fall state and return a schema event on a rising edge."""
        if not self.update_signal(is_fall, time_sec):
            return None
        first_event_sec = self.first_event_sec
        if first_event_sec is None:
            first_event_sec = time_sec
        return FallEvent(
            event_count=self.event_count,
            onset_sec=time_sec,
            first_event_sec=first_event_sec,
        )


def _observation_is_fall(observation: FrameObservation) -> bool:
    return any(label.is_fall for label in observation.labels)


def _observation_fall_probability(observation: FrameObservation) -> float:
    return max(
        (label.confidence for label in observation.labels if label.is_fall),
        default=1.0,
    )
